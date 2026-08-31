# Audit Taxonomie Yelen — Suppression Commerce & Technologie (19/08/2026)

Audit READ-ONLY. Aucun fichier applicatif modifié, aucune migration créée,
aucune donnée modifiée, aucun commit. Seul ce document a été créé, comme
mandaté. Chaque conclusion importante est sourcée fichier:ligne, vérifiée
par lecture directe. Consigne explicite du CEO respectée : ce document
**cherche à falsifier** les hypothèses du brief, pas à les confirmer —
voir en particulier §1 et §20 où une des hypothèses de départ (suppression
pure et simple de Commerce) est directement mise en tension avec des
preuves du code réel.

Documents obligatoires lus intégralement avant rédaction :
`docs/ui/YELEN_PRESTATAIRE_CTA_AUDIT.md`, `docs/ui/YELEN_PRESTATAIRE_CTA_V1_SPEC.md`
(y compris §22/§23, bilan d'implémentation réel du moteur CTA, CLOSED le
18/08/2026). Chantier Hôtel (`docs/ui/YELEN_HOTEL_MODEL_AUDIT.md`, Phases
0-3 déjà implémentées ce même jour) également pris en compte car il vient
de centraliser la taxonomie `secteur` dans `lib/institutionTaxonomy.tsx` —
fait directement pertinent pour ce mandat (§2, §8).

---

## 1. Résumé exécutif

**Trois taxonomies indépendantes existent aujourd'hui**, sans recouvrement
de chaînes entre elles :
1. `institutions.secteur` (9 valeurs depuis le chantier Hôtel du jour
   même, dont `commerce`) — classification vivante et fiable du
   prestataire lui-même, seule à être toujours écrite par le wizard actuel.
2. `institutions.category` (10 valeurs françaises legacy, dont
   **aucune ne s'appelle "Commerce"**) — cassée en écriture pour toute
   institution créée depuis le passage à `secteur` (`category = NULL`).
3. `offres.categorie` (5 valeurs, dont `commerce_pme` — namespace
   totalement différent, décrit le secteur d'un **partenaire publicitaire**,
   pas d'une institution prestataire) — système séparé, hors modèle
   `institutions`.

**Le moteur CTA V1 (`lib/prestataireCapacites.ts`, CLOSED 18/08/2026)
n'utilise `secteur` à AUCUN moment** pour décider du CTA — confirmé par
lecture directe du code livré et des tests réels exécutés lors de la
clôture (§23.3 de `YELEN_PRESTATAIRE_CTA_V1_SPEC.md`, scénario "Nimba SMS"
déjà testé et conforme : `hasWebsite=true`, `hasBooking=false` →
"Découvrir", **indépendamment de tout secteur**). Conséquence directe :
supprimer `commerce` et/ou ajouter `technologie_numerique` **n'a
strictement aucun impact sur le CTA** — la séparation
TAXONOMIE/CAPACITÉS/CTA que le CEO demande de préserver (§4 du brief) est
**déjà** la réalité du code, pas une contrainte à construire.

**Le vrai risque de cette mission n'est pas le CTA — c'est la donnée
existante.** Cet environnement n'a aucun accès à la base de données
(Bryan exécute tout SQL manuellement, cf. CLAUDE.md `/protocole`) : le
nombre d'institutions réellement `secteur='commerce'` aujourd'hui est
**inconnu**, et une suppression pure du CHECK constraint sans stratégie de
migration **casserait l'écriture** de toute institution existante qui
n'a jamais changé son secteur depuis son inscription (violation CHECK dès
le premier `UPDATE` qui la toucherait, y compris indirect).

**Point de friction avec l'hypothèse de départ (falsifié, §20)** :
supprimer `commerce` entièrement n'est **pas techniquement nécessaire**
pour résoudre le problème réel décrit (les entreprises tech mal
classées) — ajouter `technologie_numerique` **seul** suffit à le
résoudre. Supprimer `commerce` en plus est une décision produit distincte,
qui a un coût réel non nul (des commerces/boutiques légitimes, déjà
distincts de la tech, perdraient leur catégorie propre et retomberaient
dans "Services divers" — le même anti-pattern que celui dénoncé pour
Nimba SMS, appliqué cette fois aux commerces).

---

## 2. État actuel vérifié

### `institutions.secteur` — 9 valeurs (depuis aujourd'hui, chantier Hôtel)

Source unique de vérité : `lib/institutionTaxonomy.tsx:39-55` (centralisée
le 19/08/2026, chantier Hôtel Phase 0 — avant cette centralisation, la
liste était dupliquée dans 6 emplacements, cf. historique dans ce même
fichier lignes 11-15). Valeurs actuelles :
```
sante, administratif, financier, juridique, beaute_bien_etre,
commerce, artisanat, services_divers, hotel
```
CHECK constraint correspondant : `supabase/migrations/20260710000001_onboarding_prestataire.sql:12-13`
(8 valeurs d'origine) + `supabase/migrations/20260819000001_institutions_secteur_hotel.sql`
(ajout de `hotel`, migration écrite mais **non encore exécutée** par
Bryan au moment de cet audit).

Consommateurs réels (import direct de `lib/institutionTaxonomy.tsx`, tous
vérifiés par lecture directe le 19/08/2026) :
- `app/institution/inscription/engine/steps/ActiviteStep.tsx` (wizard,
  8+1 boutons de sélection).
- `app/institution/inscription/engine/steps/ReviewStep.tsx` (labels de
  relecture).
- `app/institution/[id]/dashboard/components/ProfilEntrepriseTab.tsx`
  (correction post-inscription).
- `app/institution/[id]/dashboard/components/ServicesTab.tsx:14,62,710`
  (dropdown catégorie de `paid_services` + suggestions de nom de service).
- `app/api/institution/auth/register/route.ts` (validation serveur via
  `SECTEUR_ID_LIST`).
- `app/api/institution/profile/route.ts` (idem, écriture post-inscription).
- `app/institution/[id]/InstitutionPublicClient.tsx:11` (labels/couleurs
  du badge secteur sur la fiche publique).
- `app/institution/[id]/opengraph-image.tsx:3` (image de partage social).
- `app/institution/[id]/page.tsx:3` (meta description).
- `app/compte/mes-demarches/mes-demarches-client.tsx:9`,
  `app/compte/mes-avis/mes-avis-client.tsx:11`,
  `app/compte/favoris/favoris-client.tsx:11` (labels d'affichage citoyen).

### `institutions.category` — 10 valeurs, aucune ne s'appelle "Commerce"

Vérifié par lecture directe de `app/recherche/shared.tsx:24-35`
(`CAT_META`) : `"Hopital / Clinique"`, `"Ecole / Universite"`,
`"Mairie / Administration"`, `"Banque / Microfinance"`, `"Pharmacie"`,
`"Cabinet medical"`, `"Tribunal / Justice"`, `"Transport / Logistique"`,
`"ONG / Association"`, `"Autre"`. **Aucune valeur "Commerce" n'existe
dans ce système** — confirmation directe, pas une supposition. `category`
est cassée en écriture pour toute institution créée depuis le passage au
wizard `secteur` (`app/api/institution/auth/register/route.ts:242`,
n'écrit `category` que si le body la fournit — 0 occurrence de `category`
dans tout `app/institution/inscription/**`, déjà documenté par l'audit
CTA `YELEN_PRESTATAIRE_CTA_AUDIT.md` §2, reconfirmé ici).

**Conséquence directe pour ce mandat : la suppression de `commerce` dans
`secteur` n'a AUCUN effet sur `category`/`CAT_META`/les filtres de
recherche/`CATEGORIES_RESERVATION`** — ces systèmes ne connaissent pas ce
mot. Les deux taxonomies sont bien étanches sur ce point précis (§9).

### `offres.categorie` — namespace séparé, ne pas confondre

`lib/offresCategories.ts:4-7` : `OFFRE_CAT_LABELS` = `telecom_media,
commerce_pme, service_public, evenement, autre` — 5 valeurs, décrit le
secteur d'un **partenaire publicitaire** (chantier "Offres partenaires",
26/07/2026), pas d'une institution prestataire. Le commentaire du fichier
lui-même (`lib/offresCategories.ts:9-17`) documente explicitement :
« deux taxonomies distinctes construites indépendamment... sans
recouvrement de chaînes ». Consommé par
`components/DemandePartenariatOverlay.tsx:20-26` et
`app/institution/[id]/dashboard/components/MesOffresTab.tsx:44-50`
(ce dernier **duplique** `OFFRE_CAT_LABELS` dans un tableau `CATEGORIES`
local au lieu de l'importer — dette préexistante, hors périmètre de ce
mandat, signalée pour mémoire).

**`commerce_pme` ≠ `commerce`** : valeurs différentes, tables différentes
(`offres` vs `institutions`), écrans différents. Renommer/supprimer
`secteur=commerce` **n'affecte pas** `offres.categorie=commerce_pme`.
Seul point de contact entre les deux : `lib/offresCategories.ts:18-24`
(`OFFRE_CATEGORIE_VERS_INTERETS`), une table de correspondance manuelle
pour le tri du feed Offres par centre d'intérêt citoyen — `commerce_pme
→ ["commerce", "artisanat"]`. Si `commerce` disparaît de
`lib/centresInteret.ts` (voir §3), cette ligne référencerait un id de
centre d'intérêt inexistant — impact mineur (juste un id qui ne matche
plus jamais rien dans le tri, pas un crash, la fonction de tri
correspondante n'a pas été auditée en détail ici car hors périmètre
strict du brief, mais signalé pour la checklist d'implémentation, §17).

---

## 3. Où Commerce est utilisé

Recherche exhaustive `commerce|Commerce` sur `app/`, `lib/`, `components/`,
`supabase/migrations/` (19/08/2026). Répartition par nature exacte :

| Emplacement | Nature | Rapport avec `institutions.secteur` |
|---|---|---|
| `lib/institutionTaxonomy.tsx:41,51,67,106,125` | **Source de vérité** — `SecteurId`, `SECTEURS`, `SECTEUR_COLORS`, `SERVICES_PAR_SECTEUR`, `SecteurIcon()` | Direct — c'est la définition elle-même |
| `supabase/migrations/20260710000001_onboarding_prestataire.sql:13` | CHECK constraint SQL | Direct — la contrainte qui autorise la valeur en base |
| `app/institution/[id]/InstitutionPublicClient.tsx:119` | `SECTEUR_ICON` (icône badge fiche publique, jeu d'icônes **distinct** de `SecteurIcon`, volontairement, cf. commentaire ligne 106-107) | Direct, affichage fiche publique |
| `app/institution/[id]/dashboard/components/ServicesTab.tsx:66` | `SECTEUR_COLOR` — couleur du badge catégorie de `paid_services` (indexé par **label** français, pas par id) | Direct, dashboard — dropdown alimenté par `SECTEURS.map(s => s.label)` (`ServicesTab.tsx:62`) |
| `supabase/migrations/20260720000002_paid_services_categorie.sql` | `paid_services.categorie` — texte libre, **pas de CHECK**, mais dropdown UI propose la taxonomie `SECTEURS` (commentaire ligne 2-4 de la migration elle-même) | Indirect — des lignes `paid_services` existantes peuvent contenir la chaîne littérale `"Commerce"` sans qu'aucune contrainte DB ne le garantisse ou l'empêche |
| `lib/centresInteret.ts:11,25` | `CentreInteretId`, section "Services & démarches" des centres d'intérêt citoyen | Dérivé — réutilise **volontairement** les 8(+1) ids de `secteur` (commentaire fichier lignes 1-8 : « pour que ces centres d'intérêt puissent un jour alimenter des recommandations réelles... sans table de correspondance à maintenir ») |
| `lib/citoyenTendances.ts:11` | `SECTEUR_LABEL` — labels pour "vos tendances" citoyen (RDV les plus fréquents par secteur) | Dérivé, copie indépendante des labels |
| `app/menu/vos-tendances/vos-tendances-client.tsx:58` | Même `SECTEUR_LABEL`, **copie inline dupliquée volontairement** (commentaire `lib/citoyenTendances.ts:1-3` : « qui garde sa propre copie inline — non modifié pour limiter le risque de régression ») | Dérivé, duplication assumée |
| `app/api/citoyen/suivis/route.ts:29` | Même liste de labels, alimente la section "Votre activité" (Mes démarches) | Dérivé |
| `app/menu/interets/interets-client.tsx:27` | Icône SVG dédiée pour le centre d'intérêt "commerce" | Dérivé, rendu visuel |
| `app/conditions-prestataires/page.tsx:97` | « Registre du **Commerce** et du Crédit Mobilier (RCCM) » | **Faux positif** — nom légal d'un registre officiel guinéen, aucun rapport avec la taxonomie `secteur` |
| `lib/documentsInstitution.ts:36` | « Registre de **Commerce** (RCCM) » — libellé d'un document requis pour `statut_juridique='prive_formel'` | **Faux positif** — même registre légal, indexé sur `statut_juridique`, jamais sur `secteur` (commentaire fichier lignes 1-3 : « jamais secteur, décision tranchée ») |
| `lib/offresCategories.ts` / `MesOffresTab.tsx` / `DemandePartenariatOverlay.tsx` | `commerce_pme` (Offres partenaires) | **Namespace différent**, voir §2 |

**Où Commerce N'EST PAS utilisé** (vérifié négativement, important pour
la falsification) : aucune occurrence dans `type_institution` (enum admin,
non vérifié en base, absent du code applicatif de toute façon — CLAUDE.md
`/enums`), aucun test (aucun framework de test dans le projet, CLAUDE.md
`/protocole`), aucune donnée seed trouvée dans `supabase/migrations/`
(recherche exhaustive du dossier entier, seuls les 2 fichiers du tableau
ci-dessus contiennent le mot).

---

## 4. Impact de sa suppression

**Fichiers à modifier si `commerce` est retiré de `secteur`** (liste
exhaustive, dérivée de §3, réduite à 1 fichier source grâce à la
centralisation du jour même — voir §2/§8) :
1. `lib/institutionTaxonomy.tsx` — retirer `commerce` de `SecteurId`,
   `SECTEURS`, `SECTEUR_COLORS`, `SERVICES_PAR_SECTEUR`, et le `case
   "commerce"` de `SecteurIcon()`. **Seul fichier strictement
   nécessaire** grâce à la centralisation Phase 0 du chantier Hôtel — se
   propage automatiquement au wizard, à `ProfilEntrepriseTab.tsx`, à
   `ServicesTab.tsx`, aux routes serveur (`SECTEUR_ID_LIST`).
2. `app/institution/[id]/InstitutionPublicClient.tsx:119` —
   `SECTEUR_ICON` (jeu d'icônes séparé de la fiche publique) : retirer
   l'entrée `commerce: Icons.CatCommerce` — sinon la clé reste présente
   mais jamais atteinte (mort, pas un bug, juste une icône orpheline).
3. `app/institution/[id]/dashboard/components/ServicesTab.tsx:66` —
   `SECTEUR_COLOR["Commerce"]` deviendrait une entrée orpheline (le label
   n'existerait plus dans `CATEGORIE_OPTIONS`, donc jamais indexée) — à
   retirer par hygiène, pas bloquant (`hashColor()` sert déjà de repli
   pour tout label inconnu, ligne 78).
4. `lib/centresInteret.ts:11,25` — décision produit séparée : retirer
   "Commerce" des centres d'intérêt citoyen aussi, ou le laisser vivre
   indépendamment de `secteur` (il n'est plus dérivé dynamiquement, c'est
   une liste recopiée à la main) ? **Non tranché ici, voir §19.**
5. `lib/citoyenTendances.ts:11`, `vos-tendances-client.tsx:58`,
   `suivis/route.ts:29` — mêmes copies de labels, même décision à
   prendre : un citoyen ayant déjà des RDV historiques avec
   `secteur='commerce'` verrait son label toujours résolu correctement
   (ces maps ne sont pas liées au CHECK constraint, elles restent
   fonctionnelles même si `commerce` n'est plus proposé à l'inscription)
   — **aucune casse technique**, juste une incohérence produit si Commerce
   disparaît de l'inscription mais reste un centre d'intérêt sélectionnable.
6. `app/menu/interets/interets-client.tsx:27` — idem, icône orpheline si
   la section 4 est retirée en même temps.

**Ce qui NE nécessite AUCUNE modification** (confirmé, pas supposé) :
- Le moteur CTA (`lib/prestataireCapacites.ts`) — n'a jamais lu `secteur`
  (§1, §10).
- `app/recherche/**`, `components/CarteMapHome.tsx`, `app/api/admin/kpis/route.ts`,
  `app/api/admin/export/route.ts` — tous pilotés par `category`, pas
  `secteur` (§9), et `category` n'a jamais eu de valeur "Commerce" (§2).
- `offres.categorie` / `commerce_pme` — namespace différent (§2).

---

## 5. Données existantes concernées

**Limite explicite, honnêteté requise par le mandat (§8 du brief)** :
cet environnement n'a **aucun accès direct à la base de données**
Supabase — CLAUDE.md `/protocole` et `/auth` documentent que Bryan
exécute tout SQL manuellement, jamais Claude Code. Je ne peux donc
fournir **aucun** des chiffres suivants demandés par le brief :
- Nombre d'institutions par secteur.
- Nombre d'institutions actuellement `secteur='commerce'`.
- Exemples représentatifs de ces institutions.
- Nombre de lignes `paid_services` avec `categorie='Commerce'` (texte
  libre, §3 — aucune garantie que ce soit la seule graphie utilisée :
  une institution pourrait avoir tapé "Commerce" via l'option "Autre
  (préciser)" avant même l'existence de cette valeur dans `SECTEURS`,
  ou une variante de casse).

**Requêtes SQL que Bryan doit exécuter avant toute décision de
migration** (à fournir prêtes à copier-coller lors de l'implémentation,
pas exécutées ici) :
```sql
SELECT secteur, count(*) FROM institutions GROUP BY secteur ORDER BY count(*) DESC;
SELECT id, name, secteur, statut, created_at FROM institutions WHERE secteur = 'commerce';
SELECT categorie, count(*) FROM paid_services WHERE categorie ILIKE '%commerce%' GROUP BY categorie;
```

**Ce que le code seul permet d'affirmer sans ces requêtes** : la valeur
`commerce` existe dans le CHECK constraint depuis la migration
`20260710000001` (10/07/2026) — donc **potentiellement écrite** par
n'importe quelle institution inscrite depuis cette date jusqu'à
aujourd'hui (plus d'un mois de fenêtre). Le risque n'est pas hypothétique
: c'est une des 8 options du wizard depuis plus d'un mois, sans aucun
signal dans le code qu'elle serait sous-utilisée ou non choisie.

---

## 6. Analyse des entreprises technologiques

**Constat confirmé (falsification de "aucune catégorie n'existe")** :
recherche exhaustive de `tech|Tech|numerique|numérique|SaaS|logiciel|informatique`
dans `lib/institutionTaxonomy.tsx`, `app/institution/inscription/**`,
`app/recherche/shared.tsx` — **0 résultat**. Le CEO a raison : aucune des
9 valeurs de `secteur` ni des 10 valeurs de `category` ne correspond à une
entreprise technologique/numérique/télécom/SaaS. Les 9 valeurs actuelles
(`sante, administratif, financier, juridique, beaute_bien_etre, commerce,
artisanat, services_divers, hotel`) sont toutes soit des secteurs
réglementés/physiques (santé, juridique, hôtel), soit des activités de
service de proximité (beauté, artisanat) — aucune n'est pensée pour une
organisation B2B/plateforme numérique.

**Où une entreprise comme Nimba SMS atterrirait aujourd'hui**, faute de
mieux : très probablement `services_divers` (le catch-all générique,
suggestions "Consultation, Prestation à domicile, Rendez-vous conseil,
Autre" — `lib/institutionTaxonomy.tsx:108`, aucune ne correspond à un
service SMS/API) — **pas `commerce`** en réalité (`commerce` suggère
"Vente en boutique, Retrait de commande, Conseil produit, Livraison",
`lib/institutionTaxonomy.tsx:106` — encore moins pertinent pour une PME
tech que `services_divers`). C'est une nuance importante par rapport au
brief : le risque décrit par le CEO ("ne pas mettre les entreprises
technologiques dans Commerce par défaut") est réel en esprit, mais dans
les faits, une entreprise tech choisirait probablement déjà
`services_divers` plutôt que `commerce` avec le wizard actuel — les deux
catégories sont également inadaptées, aucune n'est un "défaut" technique
imposé par le code (le wizard ne présélectionne jamais de valeur).

**Preuve que le cas est déjà anticipé ailleurs dans le produit** :
`YELEN_PRESTATAIRE_CTA_V1_SPEC.md` §1 utilise **littéralement** Nimba SMS
comme exemple de référence depuis le 17/08/2026 pour justifier que le CTA
doit être piloté par les capacités et non par la catégorie — ce chantier
est déjà **clos et implémenté** (§22-23 du même document), avec un test
réel nommé "Nimba SMS" (§22.3 test #2) qui passe : `hasWebsite=true,
hasBooking=false → "Découvrir"`, **sans avoir eu besoin d'un secteur
"Technologie"** pour fonctionner correctement. Ce point est important :
le problème du **CTA** de Nimba SMS est déjà résolu, indépendamment de
ce mandat. Ce qui reste non résolu est uniquement la **classification
affichée** (badge secteur sur la fiche, label recherche/icône) — un
problème de justesse taxonomique, pas un problème fonctionnel.

---

## 7. Cas Nimba SMS

Nimba SMS n'existe pas dans la base de données du produit (aucune
occurrence du nom dans le code ou les migrations, aucun accès DB — §5) —
c'est un exemple donné par Bryan et déjà utilisé comme cas de référence
dans `YELEN_PRESTATAIRE_CTA_V1_SPEC.md` (fictif ou réel, non vérifiable
depuis cet environnement).

**Ce qui se passerait concrètement si `technologie_numerique` était
créé** (déroulé technique, aucune implémentation faite) :
1. Nimba SMS s'inscrit, choisit "Technologie & numérique" à l'étape
   Secteur du wizard (`ActiviteStep.tsx`).
2. `institutions.secteur = 'technologie_numerique'` est écrit, validé
   par le CHECK constraint étendu et par `SECTEUR_ID_LIST` côté serveur.
3. Sur la fiche publique : badge "Technologie & numérique" avec sa
   couleur/icône dédiée (`SECTEUR_META`/`SECTEUR_ICON` — ce dernier à
   compléter, §4).
4. **Le CTA reste entièrement gouverné par ses capacités réelles**
   (`hasWebsite`, `hasWhatsApp`, etc.) — aucune ligne de
   `lib/prestataireCapacites.ts` ne fait référence à `secteur`, confirmé
   par relecture directe de ce fichier (76 lignes, cf. §23.3 de la spec
   CTA) : le badge "Technologie & numérique" et le CTA "Découvrir"
   coexistent sans interaction de code entre eux, exactement le
   découplage que le CEO demande de préserver (§4 du brief) — **déjà
   acquis, pas à construire**.
5. Aucun autre écran ne serait affecté par défaut (recherche/carte
   continuent d'utiliser `category`, qui resterait NULL comme pour toute
   institution récente — §2, §9 — sauf décision séparée de réparer
   `category`, hors périmètre explicite de ce mandat).

---

## 8. Proposition de nouvelle taxonomie

Table complète des 9 valeurs actuelles + la 10ᵉ proposée. **Aucune
modification faite** — ceci est une proposition à valider (§19).

| Valeur technique | Libellé | Description | Exemples | CTA attendu (piloté par capacités, jamais par le secteur) | Icône (`SecteurIcon`) | Couleur | Défini dans | Risques |
|---|---|---|---|---|---|---|---|---|
| `sante` | Santé | Établissements de soin | Hôpital, clinique, cabinet médical | RDV (quasi toujours `hasBooking=true`) | Cercle + croix | `#ef4444` | `lib/institutionTaxonomy.tsx:46,62,101,120` | Aucun |
| `administratif` | Administratif | Institutions publiques/démarches | Mairie, préfecture | RDV | Maison/bâtiment | `#F5A623` | idem:47,63,102,121 | Aucun |
| `financier` | Financier | Banques, microfinance | Banque, IMF | RDV ou Découvrir | Carte/coffre | `#22c55e` | idem:48,64,103,122 | Aucun |
| `juridique` | Juridique | Professions du droit | Avocat, notaire | RDV | Balance | `#f43f5e` | idem:49,65,104,123 | Aucun |
| `beaute_bien_etre` | Beauté / Bien-être | Soins esthétiques | Coiffeur, spa | RDV | Étincelle | `#a855f7` | idem:50,66,105,124 | Aucun |
| `commerce` | Commerce | Vente/boutique | Boutique, retrait de commande | Découvrir ou Appeler (rarement RDV) | Sac | `#06b6d4` | idem:51,67,106,125 | **Ciblé pour suppression (§9)** |
| `artisanat` | Artisanat | Production sur mesure | Couturier, réparateur | RDV ou Appeler | Outil | `#f97316` | idem:52,68,107,126 | Aucun |
| `services_divers` | Services divers | Catch-all résiduel | Tout ce qui ne rentre nulle part ailleurs | Variable | 9 points (fallback générique) | `#8b5cf6` | idem:53,69,108,128 | **Deviendrait le repli des entreprises tech ET des commerces si les deux sont retirés sans remplacement dédié — dilution du sens de cette catégorie** |
| `hotel` | Hôtel | Hébergement | Hôtel, auberge | RDV (demande de réservation, V1 vitrine) | Lit | `#3b82f6` | idem:54,70,112,127 (chantier du 19/08/2026) | Aucun — chantier fermé aujourd'hui même |
| `technologie_numerique` *(proposé, non créé)* | Technologie & numérique | Entreprises B2B tech/numérique/télécom | Nimba SMS, fournisseur SaaS, agence digitale, opérateur télécom, cybersécurité | Découvrir (si site web) sinon Appeler/WhatsApp — **jamais RDV forcé** | À créer (proposition §8.1) | À choisir, ne pas collisionner avec les 9 couleurs existantes (ex. `#0ea5e9` cyan-bleu, distinct de `hotel` `#3b82f6` et `commerce` `#06b6d4`) | À créer dans `lib/institutionTaxonomy.tsx` | Aucun risque technique identifié (§7) — seul risque réel : sur-segmentation si peu d'entreprises tech s'inscrivent réellement (donnée inconnue, §5) |

### 8.1 Proposition d'icône pour `technologie_numerique`

Cohérente avec le style existant (stroke, `currentColor`, `viewBox 0 0 24
24`, pas d'emoji — convention du fichier, commentaire
`lib/institutionTaxonomy.tsx:115-116`) :
```tsx
case "technologie_numerique": return <svg {...p}><rect x="2" y="4" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>;
```
(icône "écran/moniteur", déjà un pattern visuellement distinct des 9
autres — proposition uniquement, pas ajoutée au code).

### 8.2 Sur le nom et la valeur technique proposés par le CEO

`technologie_numerique` (snake_case, transcription directe du français,
sans accent) est **cohérent avec la convention déjà en place** —
`beaute_bien_etre`, `services_divers` suivent exactement ce même schéma.
Aucune collision trouvée avec les ids déjà utilisés ailleurs
(`lib/centresInteret.ts`, `lib/offresCategories.ts`, `lib/leconsArgent.ts`
— recherche du mot "numerique"/"technologie", 0 résultat). **Le libellé
et la valeur technique proposés par le CEO sont validés sans réserve
technique.**

Une reformulation alternative a été considérée puis écartée : `tech`
(trop anglicisé/ambigu — pourrait aussi désigner de l'artisanat
technique) et `numerique` seul (trop large, engloberait aussi
potentiellement des médias/télécoms sans lien avec le logiciel). La
proposition du CEO est la plus précise des options envisagées.

---

## 9. Secteur vs category

**Recommandation (pas une décision imposée — le brief §3 demande
explicitement de ne pas trancher `category` automatiquement) :**
`secteur` **doit rester la seule source de vérité** pour classifier une
institution. Preuve par les faits, pas par principe :
- `secteur` est la **seule** taxonomie toujours écrite par le wizard
  actuel (`register/route.ts`, validation stricte `SECTEUR_ID_LIST`).
- `category` est cassée en écriture depuis plus d'un mois pour toute
  nouvelle institution (§2) — **rien dans ce mandat ne dépend de sa
  réparation**, le moteur CTA l'a déjà démontré en marchant sans elle.
- Les deux taxonomies ne partagent aucune valeur ("Commerce" n'existe
  que dans `secteur`, jamais dans `category` — §2), donc il n'y a **pas
  de conflit de nommage direct** à résoudre pour ce mandat spécifique.

**Ce que ce mandat NE doit PAS faire (conforme à l'instruction explicite
du brief §3)** : ni réparer `category`, ni la supprimer, ni la fusionner
avec `secteur`. Cela reste un chantier séparé, déjà documenté comme tel
dans `YELEN_PRESTATAIRE_CTA_AUDIT.md` §15 point 2 et
`YELEN_PRESTATAIRE_CTA_V1_SPEC.md` §20 point 2 — deux audits antérieurs
ont déjà soulevé la question sans la trancher.

**Découverte annexe, hors périmètre strict mais pertinente pour la
vigilance du CEO (§3 du brief : "éviter deux systèmes concurrents")** :
`app/admin/institutions/page.tsx:156,171` affiche une colonne **intitulée
"Secteur"** dans le tableau admin, mais dont la valeur réelle est
`inst.category` (`secteur: <span>{inst.category || '—'}</span>`) — pas
`inst.secteur`. De même, `app/api/admin/kpis/route.ts:62,87,127-134`
construit un objet **nommé** `secteursData`/`secteurCounts`/`secteursArr`
(exposé au client comme `kpis.secteurs`, `app/admin/adminTypes.ts:31`,
affiché "Secteurs institutions" dans le dashboard admin
`app/admin/page.tsx:283-286`) — mais la requête source est
`.from('institutions').select('category')` (`kpis/route.ts:62`), jamais
`secteur`. **C'est exactement la confusion que le CEO redoute au §3**,
déjà présente en production, indépendamment de ce mandat. Ni Commerce ni
Technologie n'y apparaîtront jamais correctement tant que ce bug n'est
pas corrigé (`category` étant NULL pour toute institution récente, ce
KPI est silencieusement vide/trompeur depuis plus d'un mois). **Signalé
pour information, non corrigé ici** (hors périmètre explicite, chantier
distinct).

Autre confirmation directe : `app/recherche/RechercheOverlay.tsx:286`
compare `i.secteur` (un id brut, ex. `"commerce"`) à `secteurTopLabel`
(un **libellé** affiché, ex. `"Commerce"`, dérivé par
`lib/citoyenTendances.ts:71`) — comparaison id vs libellé, qui ne peut
matcher que par coïncidence de casse sur les valeurs à un seul mot sans
accent (jamais pour `beaute_bien_etre` vs "Beauté / Bien-être", par
exemple). Bug préexistant, indépendant de Commerce/Technologie,
**non corrigé ici** (hors périmètre).

---

## 10. Impact sur CTA V1

**Aucun.** Démontré par preuve directe, pas par déduction :
- `lib/prestataireCapacites.ts` (module unique du moteur CTA, clos et
  vérifié le 18/08/2026) n'importe ni ne référence `secteur` — confirmé
  par la relecture intégrale documentée en `YELEN_PRESTATAIRE_CTA_V1_SPEC.md`
  §23.3 ("les 2 seules fonctions exportées... aucune logique de CTA
  dupliquée ailleurs").
- La priorité du CTA (`hasBooking > hasWebsite > hasWhatsApp > hasPhone`)
  est une fonction pure des capacités réelles de l'institution
  (services/disponibilités/website/whatsapp/phone), jamais de son
  secteur — règle CEO déjà actée et implémentée (§7 de la spec CTA :
  "`secteur` n'intervient à aucun moment dans cette priorité").
- Le test réel "Nimba SMS" (§22.3 test #2 de la spec CTA, déjà exécuté)
  prouve que le cas d'usage central du brief actuel (une entreprise tech
  affichant "Découvrir" plutôt que "Prendre RDV") **fonctionne déjà**,
  sans qu'aucun secteur "Technologie" n'existe.

**Conséquence pour l'implémentation future** : ajouter
`technologie_numerique` et/ou retirer `commerce` ne touchera **jamais**
`lib/prestataireCapacites.ts` ni `InstitutionPublicClient.tsx` dans sa
section CTA (hero/bandeau fixe, lignes ~1073/~2100) — seul le badge
secteur (couleur/icône/label, calculé séparément, sans lien de données
avec `ctaDecision`) serait affecté. La séparation
TAXONOMIE → CAPACITÉS → CTA que le brief (§4) demande de préserver est
techniquement garantie par construction : ce sont deux blocs de calcul
totalement indépendants dans le même fichier, aucune variable partagée
entre `meta`/`CatIconComp` (secteur) et `capacites`/`ctaDecision` (CTA).

---

## 11. Impact inscription

Grâce à la centralisation `lib/institutionTaxonomy.tsx` réalisée le jour
même (chantier Hôtel, Phase 0) : **un seul fichier à modifier**
(`lib/institutionTaxonomy.tsx`) pour retirer `commerce` et/ou ajouter
`technologie_numerique` — se propage automatiquement à :
- `ActiviteStep.tsx` (grille de boutons du wizard, `SECTEURS.map()`).
- `ReviewStep.tsx` (label de relecture, `SECTEUR_LABELS`).
- `register/route.ts` (validation `SECTEUR_ID_LIST`).

**Aucun texte codé en dur à mettre à jour séparément** — c'est
précisément le bénéfice recherché par la centralisation du jour, qui
n'existait pas avant aujourd'hui (avant la Phase 0 du chantier Hôtel, la
liste était dupliquée dans 6 emplacements différents, cf.
`docs/ui/YELEN_HOTEL_MODEL_AUDIT.md` Partie 2 — ce travail de
centralisation, fait plus tôt dans la même journée, rend ce mandat
beaucoup moins risqué qu'il ne l'aurait été hier).

---

## 12. Impact recherche

**Aucun impact technique** — démontré, pas supposé (§2, §9) :
`app/recherche/RechercheInner.tsx:846` (`query.eq("category", filterCat)`),
`app/recherche/shared.tsx:24-35` (`CAT_META`), `components/CarteMapHome.tsx`
(même système `category`) — aucun de ces fichiers ne lit `secteur`, et
`category` n'a jamais contenu "Commerce". Retirer `commerce` de `secteur`
et/ou ajouter `technologie_numerique` **ne modifie aucun résultat de
recherche, aucun filtre, aucune icône de carte**.

**Ce qui reste vrai indépendamment de ce mandat** (déjà documenté par
`YELEN_PRESTATAIRE_CTA_AUDIT.md` §7/§14 risque 1) : la recherche continue
d'afficher "Prendre RDV"/"Réserver" pour toute institution, y compris une
future entreprise `technologie_numerique`, car son CTA de carte est
piloté par `libelleAction(category)` (`app/recherche/shared.tsx:40-42`),
pas par les capacités réelles (le CTA V1 capacité-driven n'a été
implémenté que sur la fiche complète — Option A, §13 de la spec CTA,
incohérence UX temporaire déjà actée et assumée par le CEO le
17/08/2026). Une future entreprise tech verrait donc "Réserver"/"RDV" sur
sa carte de recherche mais "Découvrir" sur sa fiche complète —
**comportement déjà existant pour toute institution aujourd'hui**, pas
une régression introduite par ce mandat.

---

## 13. Impact fiche publique

Trois éléments distincts affectés, tous dans
`app/institution/[id]/InstitutionPublicClient.tsx`, tous des simples
lookups dans des `Record<string, X>` avec repli déjà existant — aucune
casse possible même en cas d'oubli d'une entrée :
1. **Badge secteur (couleur)** — `SECTEUR_META[inst.secteur ?? ""] || {
   color: "#F5A623" }` (ligne 876/192) : si `commerce` disparaît de
   `SECTEUR_META` mais qu'une institution existante a encore
   `secteur='commerce'` en base (cas très probable si aucune migration
   de données n'est faite, §5), le repli doré générique s'applique —
   **dégradation silencieuse, pas un crash**.
2. **Badge secteur (icône)** — `SECTEUR_ICON[inst.secteur ?? ""] ||
   Icons.Building` (ligne 877/193) : même repli gracieux déjà en place
   (utilisé aujourd'hui même pour `hotel`, volontairement, chantier de
   ce matin).
3. **Label texte du secteur** — `SECTEUR_LABELS[inst.secteur] ||
   inst.secteur` (ligne 1039) : si `commerce` est retiré de
   `SECTEUR_LABELS` mais qu'une institution a encore `secteur='commerce'`
   en base, la fiche afficherait littéralement le mot brut `"commerce"`
   (minuscule, sans mise en forme) au lieu de "Commerce" — **seul point
   de dégradation visuelle réelle**, mineur mais visible, si des
   institutions existantes ne sont pas migrées avant la suppression du
   CHECK constraint (§16).

**Recommandation technique implicite** : ce risque n'existe QUE si des
institutions existantes ont `secteur='commerce'` sans être re-classées —
raison supplémentaire de traiter la donnée existante (§5) avant toute
suppression de valeur du code.

---

## 14. Impact dashboard

`app/institution/[id]/dashboard/components/ServicesTab.tsx` :
- `CATEGORIE_OPTIONS` (ligne 62, `SECTEURS.map(s => s.label)` +
  "Autre (préciser)") — perdrait "Commerce" automatiquement si retiré de
  `SECTEURS`. Une institution ayant déjà un `paid_services.categorie =
  "Commerce"` existant (texte libre, §3) verrait toujours sa donnée
  affichée telle quelle (`paid_services.categorie` n'est pas contraint
  par un CHECK, §3) — juste absente du dropdown pour une **future**
  création/modification.
- `SECTEUR_COLOR["Commerce"]` (ligne 66) — deviendrait une entrée morte,
  sans effet néfaste (`categoryColor()`, ligne 76-84, retombe sur
  `hashColor()` pour tout label absent de la map).

`app/institution/[id]/dashboard/components/ProfilEntrepriseTab.tsx` —
sélecteur de correction de secteur post-inscription, alimenté par
`SECTEURS`/`SecteurIcon` (import direct de `lib/institutionTaxonomy.tsx`)
— se met à jour automatiquement, **aucune modification propre nécessaire**
dans ce fichier.

**Aucun autre écran dashboard** ne référence `secteur` de façon
structurelle (recherche exhaustive du dossier
`app/institution/[id]/dashboard/components/`, seuls les 2 fichiers
ci-dessus + le chantier Hôtel de ce matin — `ConfigurationHotelTab.tsx` —
qui teste `secteur === "hotel"` explicitement, sans lien avec
Commerce/Technologie).

---

## 15. Migration DB nécessaire ou non

**Oui, une migration est nécessaire**, mais sa nature dépend
entièrement de la décision prise en §19/§20 concernant les institutions
existantes (`secteur='commerce'`) — **c'est la seule vraie question
technique ouverte de ce mandat**, tout le reste est un simple
remplacement de valeurs dans un fichier déjà centralisé (§11).

**Option A — Ajouter `technologie_numerique` SANS retirer `commerce`**
(la plus sûre, cf. §20) :
```sql
ALTER TABLE institutions DROP CONSTRAINT institutions_secteur_check;
ALTER TABLE institutions ADD CONSTRAINT institutions_secteur_check
  CHECK (secteur IS NULL OR secteur IN (
    'sante','administratif','financier','juridique','beaute_bien_etre',
    'commerce','artisanat','services_divers','hotel','technologie_numerique'
  ));
```
Aucun backfill nécessaire (élargissement pur, même schéma que la
migration `hotel` de ce matin) — **piège connu du projet évité** (CLAUDE.md
`/pieges-techniques-connus` : toujours retirer la contrainte avant un
backfill, jamais l'inverse — non applicable ici car aucun backfill).

**Option B — Retirer `commerce` en plus** (nécessite une stratégie de
données, §16) :
```sql
-- ⚠️ Uniquement après confirmation qu'aucune ligne n'a secteur='commerce',
-- OU après un UPDATE de migration des lignes concernées (voir §16) —
-- jamais l'ordre inverse (DROP+ADD avant migration des données), sous
-- peine de rendre invalides des lignes déjà en base sans les corriger
-- (elles resteraient lisibles mais bloqueraient tout futur UPDATE de
-- cette ligne tant que secteur n'est pas corrigé manuellement).
ALTER TABLE institutions DROP CONSTRAINT institutions_secteur_check;
ALTER TABLE institutions ADD CONSTRAINT institutions_secteur_check
  CHECK (secteur IS NULL OR secteur IN (
    'sante','administratif','financier','juridique','beaute_bien_etre',
    'artisanat','services_divers','hotel','technologie_numerique'
  ));
```

**Aucune migration n'est nécessaire pour `category`** — hors périmètre
(§9), et de toute façon `category` n'a jamais eu de valeur "Commerce" à
retirer.

---

## 16. Risques

1. **Institutions existantes `secteur='commerce'` invalidées si le CHECK
   est retiré sans stratégie de données** (§5, §15) — risque réel,
   sévérité dépendante d'un nombre aujourd'hui inconnu. Toute institution
   concernée ne pourrait plus être `UPDATE`-ée (même sur un champ sans
   rapport) tant que son `secteur` n'est pas corrigé manuellement,
   puisque Postgres revalide **toute la ligne** contre le CHECK à chaque
   `UPDATE`, pas seulement la colonne modifiée.
2. **Dégradation visuelle silencieuse sur la fiche publique** (§13) pour
   toute institution existante non migrée — label brut affiché au lieu
   d'un libellé propre.
3. **`services_divers` devient un double catch-all** (commerces ET
   entreprises tech mal classées) si Commerce est supprimé sans
   qu'aucune de ces institutions ne soit re-classée manuellement — le
   même problème que celui dénoncé pour Nimba SMS, déplacé plutôt que
   résolu (§8, colonne `services_divers`).
4. **`paid_services.categorie` orpheline** — texte libre non contraint,
   des lignes existantes avec `"Commerce"` continueraient d'exister et
   de s'afficher indéfiniment (aucune casse, mais incohérence durable
   entre ce qui est encore proposé au choix et ce qui existe déjà en
   base) — §3, §14.
5. **`OFFRE_CATEGORIE_VERS_INTERETS["commerce_pme"]`** référencerait un
   id de centre d'intérêt disparu si `lib/centresInteret.ts` est
   également nettoyé (§2, §4) — impact mineur (un id qui ne matche plus
   rien), non testé en détail ici (fonction de tri du feed Offres non
   auditée, hors périmètre strict).
6. **Incohérence produit temporaire, pas technique** entre les centres
   d'intérêt citoyen ("Commerce" y resterait sélectionnable même après
   suppression de l'inscription institution) si §4 point 4/5 n'est pas
   traité — décision produit distincte, non tranchée ici.
7. **Sur-segmentation si peu d'entreprises tech existent réellement** —
   donnée inconnue (§5), risque business plus que technique, à évaluer
   par le CEO une fois les vraies données consultées.
8. **Aucun risque identifié sur le moteur CTA** (§10) — le seul point du
   brief explicitement à protéger (§4) est déjà garanti par
   l'architecture existante.

---

## 17. Plan d'implémentation minimal

**Séquence recommandée, dans l'ordre, aucune étape exécutée** :

1. Bryan exécute les 3 requêtes SQL du §5 — obtenir le nombre réel
   d'institutions `secteur='commerce'` et de `paid_services.categorie`
   contenant "Commerce".
2. CEO tranche les points du §19 (notamment : suppression réelle de
   Commerce, ou ajout seul de Technologie & numérique — §20 recommande
   fortement la seconde option).
3. Si suppression confirmée ET institutions existantes trouvées à
   l'étape 1 : décider au cas par cas (ou par défaut vers
   `services_divers`) leur nouveau secteur — **jamais une migration SQL
   automatique sans regard humain sur chaque institution concernée**,
   cohérent avec CLAUDE.md `/protocole` ("zéro donnée inventée").
4. Écrire la migration SQL (Option A ou B du §15) — Bryan l'exécute
   manuellement, comme pour la migration `hotel` de ce matin.
5. Modifier `lib/institutionTaxonomy.tsx` (ajout/retrait de valeurs,
   couleurs, icône `technologie_numerique` si créée) — **1 seul fichier
   applicatif nécessaire** grâce à la centralisation déjà faite.
6. Si suppression de Commerce confirmée : nettoyer les 2 entrées
   orphelines mineures (`InstitutionPublicClient.tsx:119` `SECTEUR_ICON`,
   `ServicesTab.tsx:66` `SECTEUR_COLOR`) — cosmétique, non bloquant.
7. Si extension aux centres d'intérêt citoyen décidée (§19 point 12) :
   modifier `lib/centresInteret.ts` séparément — **chantier distinct**,
   pas requis techniquement par ce mandat.
8. `npx tsc --noEmit` puis `npm run build` — même discipline que le
   chantier Hôtel de ce matin.

**Aucune migration de `lib/prestataireCapacites.ts` ni de
`app/recherche/**` n'est nécessaire à aucune étape** (§10, §12).

---

## 18. Tests nécessaires

Aucun framework de test dans le projet (CLAUDE.md `/protocole` — décision
de stack en attente). Vérifications manuelles recommandées après
implémentation, dans l'ordre du chantier Hôtel de ce matin (méthode déjà
éprouvée aujourd'hui même) :
1. Institution existante `secteur` ≠ commerce/technologie → aucun
   changement visuel/fonctionnel (fiche, dashboard, wizard).
2. Nouvelle inscription → "Technologie & numérique" apparaît dans la
   grille du wizard, sélectionnable, badge correct sur la fiche publique
   une fois créée.
3. Si Commerce supprimé : institution déjà existante avec
   `secteur='commerce'` (si non migrée) → fiche publique affiche un
   repli correct (couleur dorée générique, icône Building, label brut
   "commerce") — vérifier que ce n'est **pas** un crash, juste un
   affichage dégradé attendu et documenté.
4. CTA d'une institution `technologie_numerique` avec un site web
   renseigné mais aucun service/créneau → "Découvrir", jamais "Prendre
   RDV" — reproduit le test #2 déjà validé le 18/08/2026 pour Nimba SMS,
   à vérifier que le secteur n'a aucune influence sur ce résultat.
5. Dropdown `paid_services.categorie` (ServicesTab.tsx) → "Technologie &
   numérique" apparaît, "Commerce" disparaît si supprimé (mais toute
   ligne `paid_services` existante avec `categorie="Commerce"` reste
   affichée telle quelle).
6. `tsc --noEmit` + `npm run build` propres (même standard que le
   chantier Hôtel de ce matin, déjà vérifié 0 erreur/exit 0 aujourd'hui
   sur la centralisation de `lib/institutionTaxonomy.tsx`).

---

## 19. Décisions CEO requises

1. **Confirmer ou infirmer la suppression pure de Commerce** — voir la
   mise en tension directe au §20 : la preuve du code montre que le
   problème réel (entreprises tech mal classées) est résolu par l'ajout
   seul de `technologie_numerique`, sans nécessiter la suppression de
   Commerce. Si le CEO maintient la suppression pour une raison de
   positionnement produit non technique (ex. Yelen ne veut pas afficher
   "Commerce" comme secteur d'activité, indépendamment du problème
   Nimba SMS), c'est légitime — mais c'est alors une **décision de
   positionnement**, pas une nécessité technique, et elle doit être
   assumée comme telle.
2. **Stratégie pour les institutions existantes `secteur='commerce'`**
   (nombre inconnu, §5) — migration manuelle au cas par cas
   recommandée, jamais automatique.
3. **Confirmer `technologie_numerique` comme valeur technique** — validé
   sans réserve technique (§8.2), en attente de confirmation finale.
4. **Couleur/icône de `technologie_numerique`** — proposition faite
   (§8.1), à valider ou remplacer.
5. **`secteur` comme unique source de vérité** — recommandé sans réserve
   (§9), `category` reste hors périmètre (conforme à l'instruction
   explicite du brief).
6. **Étendre ou non la suppression/l'ajout aux centres d'intérêt citoyen**
   (`lib/centresInteret.ts`, `lib/citoyenTendances.ts`,
   `app/menu/interets/interets-client.tsx`, `app/api/citoyen/suivis/route.ts`)
   — techniquement indépendant de `institutions.secteur` (copies
   dupliquées volontairement, §4), donc **non requis** pour résoudre le
   mandat du CEO, mais laisserait une incohérence produit si non traité
   en parallèle (un citoyen pourrait "s'intéresser" à Commerce alors
   qu'aucune institution ne peut plus s'inscrire sous ce secteur).
7. **Signaler le bug `category`/"Secteurs" du dashboard admin** (§9,
   `app/admin/institutions/page.tsx:171`, `app/api/admin/kpis/route.ts:62-134`)
   — trouvé pendant cet audit, hors périmètre strict, mais pertinent
   pour la vigilance du CEO sur la confusion secteur/category qu'il
   redoute explicitement (§3 du brief).

---

## 20. Verdict final

### GO AVEC CONDITIONS

**Ajouter `technologie_numerique`** : GO sans réserve. Techniquement
trivial (1 fichier applicatif grâce à la centralisation du jour même, 1
migration SQL sans backfill, aucun impact CTA/recherche/dashboard hors
du strict nécessaire), résout intégralement le problème réel décrit
(entreprises tech mal classées), et l'architecture existante
(taxonomie/capacités/CTA découplées) rend cette extension sans risque
pour tout le reste du produit.

**Retirer `commerce`** : GO AVEC CONDITIONS STRICTES, pas un NO-GO, mais
**une hypothèse falsifiée par les preuves de ce code** qui mérite d'être
reconfirmée explicitement par le CEO avant exécution :
- La preuve directe (§7, `YELEN_PRESTATAIRE_CTA_V1_SPEC.md` §22.3) montre
  que le cas Nimba SMS est déjà résolu **sans** avoir besoin de retirer
  Commerce — seul l'ajout de Technologie était nécessaire.
- Retirer Commerce a un coût réel non nul : des commerces/boutiques
  légitimes (activité distincte des entreprises tech, suggestions de
  service différentes — §8) perdraient leur catégorie et retomberaient
  dans `services_divers`, reproduisant pour eux le problème que ce
  mandat cherche justement à corriger pour les entreprises tech.
- Le nombre d'institutions réellement concernées est **inconnu** (§5) —
  aucune décision de suppression ne devrait être prise avant que Bryan
  ait exécuté les 3 requêtes SQL fournies (§5, §17 étape 1).

### Réponses aux 11 questions du brief

1. **Commerce doit-il être totalement supprimé ?** Techniquement pas
   nécessaire pour résoudre le problème décrit — recommandation :
   d'abord ajouter Technologie, différer la suppression de Commerce
   jusqu'à consultation des données réelles (§5) et confirmation
   explicite que c'est un choix de positionnement, pas une conséquence
   du problème Nimba SMS.
2. **Institutions existantes `commerce`** : inconnues en nombre (§5) —
   migration manuelle au cas par cas si suppression confirmée, jamais
   automatique.
3. **Catégorie pour Nimba SMS** : `technologie_numerique` (proposée),
   fonctionnellement déjà correcte côté CTA dès aujourd'hui
   indépendamment de la taxonomie (§7).
4. **Faut-il créer Technologie & numérique ?** Oui, recommandé sans
   réserve.
5. **Valeur technique** : `technologie_numerique` — validée (§8.2).
6. **`secteur` reste la source de vérité ?** Oui, recommandé sans
   réserve (§9).
7. **Que fait-on de `category` ?** Rien — hors périmètre explicite de ce
   mandat, conforme à l'instruction du brief §3, chantier séparé déjà
   documenté ailleurs (deux audits antérieurs l'ont déjà soulevé sans
   trancher).
8. **Fichiers à modifier** : `lib/institutionTaxonomy.tsx` (obligatoire,
   seul fichier nécessaire pour l'ajout de Technologie) +
   `InstitutionPublicClient.tsx`/`ServicesTab.tsx` (2 lignes chacun,
   uniquement si Commerce est également retiré, §4/§14).
9. **Migration SQL** : oui, extension du CHECK constraint
   `institutions_secteur_check` — voir §15 pour les deux variantes
   possibles (avec ou sans retrait de Commerce), aucun backfill
   nécessaire dans les deux cas.
10. **CTA V1 reste cohérent ?** Oui, sans aucune modification requise —
    démontré, pas supposé (§10).
11. **Plus petit chantier sûr** : ajouter `technologie_numerique` seul
    (§15 Option A, §17) — reporte la question de Commerce à une décision
    CEO séparée une fois les données réelles consultées.

---

**Aucun code, aucune migration, aucune donnée modifiée pendant cet
audit. Seul ce document a été créé. Implémentation en attente de
validation explicite du CEO sur les points du §19.**
