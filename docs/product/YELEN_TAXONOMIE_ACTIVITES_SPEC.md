**STATUT : SPÉCIFICATION VALIDÉE PAR LE CEO (20/08/2026) — GO sur les
décisions A à F, décision G validée avec modification (politique
d'admissibilité des organisations étrangères, §3ter). AUCUN CODE ÉCRIT.**
Cette spécification est désormais la référence de conception pour
l'implémentation future du chantier Taxonomie des activités — elle ne
sera pas réécrite, seulement complétée si une future itération le
justifie. Aucun code, aucune migration SQL, aucune modification de
production, aucune donnée modifiée n'a été effectué à aucun moment de ce
mandat (audit → spécification → validation) — conformément à
l'instruction explicite du CEO de s'arrêter après le document.

---

## 1. Décisions CEO (rappel de ce qui est déjà tranché)

- Ajout de `technologie_numerique` : validé et implémenté (20/08/2026).
- Suppression de `commerce` : validée et implémentée (20/08/2026, 0
  institution concernée).
- Passage d'un modèle "catégorie plate" à un modèle "Catégorie →
  Activité exacte → Services/mots-clés" : validé conceptuellement,
  objet de cette spécification.
- Les 15 catégories du brief sont le **point de départ**, pas une
  décision figée — réexaminées §4.
- Cette phase est une spécification uniquement — implémentation
  suspendue jusqu'à validation explicite (§19).

---

## 2. Principes de taxonomie

Cinq niveaux strictement séparés, jamais confondus dans le code ni dans
les données :

1. **Catégorie** — regroupement large (15 valeurs fixes, gérées par
   migration, rarement modifiées). Sert à **organiser**, jamais à
   décrire précisément une activité.
2. **Activité principale** — ce que l'organisation **fait**
   concrètement, une par institution, obligatoire. Répond à « que
   fait principalement cet établissement ? » en langage compréhensible
   par un utilisateur normal (pas un libellé administratif/statistique).
3. **Activités secondaires** — jusqu'à 3, optionnelles, même
   nomenclature que l'activité principale (pas une liste libre).
4. **Services** — ce que l'organisation **propose** concrètement dans le
   cadre de son activité (ex. "SMS transactionnels" pour un fournisseur
   de solutions SMS). Texte libre par institution, réutilise le
   mécanisme déjà existant (`institutions.services`/`paid_services`),
   **aucune nouvelle table nécessaire** pour ce niveau.
5. **Alias/mots-clés** — synonymes de recherche d'une **activité**,
   curés par Yelen (`activites.alias`), n'affectent **jamais** la
   classification officielle affichée. Distincts des mots-clés/
   spécialités qu'une institution s'attribue elle-même (ex. "DevOps") —
   ceux-ci vivent au niveau **service** (texte libre, non curé), jamais
   comme activité ou alias officiel.

**Règle non négociable** : une catégorie ne devient jamais une liste de
produits (c'est exactement la dérive qui a justifié la suppression de
Commerce, §9). Une activité décrit un métier, jamais un objet vendu.

---

## 3. Périmètre Yelen

**Principe CEO reconfirmé** : Yelen n'est pas un catalogue de produits/
boutiques. Une organisation est admissible si elle exerce une **activité
professionnelle identifiable et rendable comme service** (au sens large :
conseil, installation, support, exécution technique, prestation
réglementée) — pas si elle se contente de revendre un produit sans
prestation associée.

**Grille de décision (reprise et complétée du brief, cas limites
explicités)** :

| Cas | Admissible ? | Justification |
|---|---|---|
| Boutique de vêtements | Non | Vente pure, aucune prestation professionnelle identifiable |
| Revendeur de téléphones (sans SAV) | Non | Idem |
| Supermarché / épicerie | Non | Idem |
| Revendeur généraliste | Non | Idem |
| Intégrateur informatique avec installation/support | Oui → Technologie | Prestation technique identifiable (intégration, support) |
| Fournisseur IT avec maintenance | Oui → Technologie | Maintenance = prestation récurrente identifiable |
| Fabricant de mobilier sur mesure | Oui → Artisanat | Fabrication sur mesure = savoir-faire, pas une revente |
| Entreprise de construction (fourniture + installation) | Oui → BTP | Exécution technique, pas une simple fourniture |
| Société de transit/dédouanement | Oui → Transport/Logistique | Prestation réglementée et identifiable |
| Vendeur de matériel informatique **avec** installation/maintenance | Oui → Technologie (activité "Vente et maintenance de matériel informatique") | La maintenance transforme la vente en prestation de service |
| Vendeur de matériel informatique **sans aucun service** | Non | Reste une vente pure, même produit |

**Cette grille n'est pas automatisable de façon fiable** (impossible de
deviner "avec ou sans service" depuis un simple libellé) — elle sert de
politique de modération humaine pour la file "Autre activité" (§11), pas
de filtre codé.

---

## 3bis. Périmètre géographique — économie locale + organisations étrangères (ajout CEO, 20/08/2026)

### Règle d'admissibilité

« Yelen référence les organisations qui ont une activité, une présence,
un service, une implantation ou une utilité identifiable pour
l'écosystème guinéen, quelle que soit leur nationalité. » Le critère
n'est **jamais** la taille, le chiffre d'affaires ou la nationalité —
un salon de coiffure de quartier et une filiale d'un groupe étranger
sont admissibles au même titre, sous les mêmes 5 questions :

1. L'activité est-elle réelle ou raisonnablement identifiable ?
2. L'organisation/le professionnel a-t-il une activité, une présence, un
   service ou une utilité identifiable **en Guinée** ?
3. L'utilisateur Yelen a-t-il une raison concrète de rechercher,
   contacter, visiter, utiliser ou prendre rendez-vous avec cette
   organisation ?
4. L'organisation peut-elle être identifiée et suffisamment vérifiée ?
5. L'activité entre-t-elle dans le périmètre stratégique de Yelen (§3) ?

**Reconfirmé explicitement** : « organisation organisée » n'est pas
« grande entreprise »/« entreprise internationale »/« entreprise
formelle uniquement ». Les acteurs de proximité (barber shop, couturier,
menuisier, soudeur, garage, artisan, entrepreneur individuel) sont déjà
couverts par la grille §3 et les catégories §4/§7 — cette règle ne les
exclut pas, elle les **confirme** comme cœur de cible, au même titre que
les organisations étrangères.

### Règle géographique — critère strict (message CEO du 20/08/2026)

« L'organisation exerce-t-elle réellement une activité, fournit-elle
réellement un service, possède-t-elle une présence, une implantation,
une représentation, une succursale, une filiale, un partenariat
opérationnel ou une activité commerciale/professionnelle réelle **EN
GUINÉE** ? »

| Cas | Admissible ? |
|---|---|
| Organisation guinéenne opérant en Guinée | Oui |
| Organisation étrangère opérant réellement en Guinée (filiale, succursale, bureau/représentation, prestataire livrant effectivement un service au marché guinéen) | Oui |
| Organisation étrangère connue/internationale mais **sans aucune opération réelle en Guinée** | **Non — hors périmètre**, même si accessible depuis Internet ou notoire |

**Exemple repris du CEO, complété** :
```
Organisation      : Microsoft Corporation
Pays d'origine     : États-Unis
Opère en Guinée    : à déterminer (preuve requise — présence, partenaire
                     local, service effectivement utilisé par le marché
                     guinéen — pas seulement "le site est accessible")
Catégorie Yelen    : Technologie, numérique & télécommunications
Activité           : Services cloud / Plateforme SaaS (selon l'offre
                     réellement vérifiée)
Identité internationale : dénomination légale + immatriculation US
                     (bloc §3ter)
```
Sans preuve d'opération réelle en Guinée, Microsoft (ou toute autre
organisation étrangère) **n'est pas référencée** — la notoriété seule ne
suffit jamais.

### Principe d'architecture — origine ≠ catégorie

**Confirmé, aucune dérogation** : l'origine guinéenne/étrangère d'une
organisation est un **attribut d'identité** (§3ter), jamais une
catégorie Yelen. Aucune catégorie « Entreprises étrangères » ni
« International » n'a été créée dans cette spécification (§4 —
vérifié, les 15 catégories restent organisées par activité réelle
exclusivement). Microsoft, comme Nimba SMS, est classée par ce qu'elle
**fait** (Technologie), jamais par d'où elle vient.

Chaîne complète, telle que demandée :
```
ORGANISATION
  → origine / identité (guinéenne ou étrangère, §3ter)
  → catégorie principale (§4)
  → activité principale exacte (§6/§7)
  → activités secondaires (§2)
  → services (§8)
  → alias (§9)
  → zone d'intervention (§3ter)
  → statut de présence en Guinée (§3ter)
  → statut de vérification (rattaché au système Yelen Trust existant, §3ter)
  → exigences réglementaires éventuelles (§10bis)
```

---

## 3ter. Identité internationale — modèle et rattachement au système existant

### Découverte importante avant de concevoir quoi que ce soit de neuf

**Yelen a déjà un système de vérification d'identité/autorité en cours
de construction** (`docs/product/YELEN_TRUST_VERIFICATION_ADMIN_WORKFLOW.md`,
Lots 2.1-2.4, **VERIFIED IN DATABASE** au 16/08/2026) :
- `documents_institution` — documents versionnés, indexés par
  `statut_juridique` (`lib/documentsInstitution.ts:8-13,23-81`, jamais
  par secteur — décision déjà tranchée dans ce fichier).
- `verification_decisions` — décision immuable insert-only, avec un
  champ **`axe`** valant déjà `identite` ou `autorite`, un
  `niveau_preuve` (`profil_verifie`/`institution_certifiee`), une
  `justification` obligatoire, un examinateur admin nommé.
- `verification_decision_preuves` — snapshot figé des preuves.

**Conséquence directe pour ce mandat** : le « statut de vérification »
demandé par le CEO pour les organisations étrangères **ne doit pas être
un nouveau système** — ce serait exactement la même erreur que deux
taxonomies concurrentes (`secteur`/`category`) que cet audit a déjà
dénoncée. L'identité internationale devient un **nouveau type de preuve
de l'axe `identite` déjà existant**, pas un mécanisme parallèle.

### Modification proposée (extension, pas création d'un nouveau système)

1. **`lib/documentsInstitution.ts`** — ajouter un type de document
   `immatriculation_etrangere` à `DocumentTypeSlug` (`:8-13`). **Décision
   CEO du 20/08/2026 (tranche le point ouvert ci-dessous)** : ce document
   n'est **pas** une exigence uniforme pour toute organisation étrangère
   — les justificatifs demandés dépendent du `statut_presence_guinee`
   réel (table §3ter.1 ci-dessous), jamais d'un RCCM guinéen imposé par
   principe. Une organisation dont le mode de présence implique
   structurellement une entité guinéenne (ex. `filiale`, déjà
   `statut_juridique=prive_formel` au sens du wizard) fournit son RCCM
   **parce que** son statut juridique guinéen l'exige déjà (mécanisme
   existant, inchangé) — pas parce qu'elle est étrangère. Une
   organisation sans entité guinéenne (ex. `prestataire_depuis_etranger`)
   ne se voit jamais réclamer un RCCM qui n'a pas de sens pour son mode
   de présence réel.
2. **Nouvelle table `institution_identite_internationale`** (1:1 avec
   `institutions`, uniquement pour les institutions étrangères) :
   ```sql
   CREATE TABLE institution_identite_internationale (
     institution_id uuid PRIMARY KEY REFERENCES institutions(id) ON DELETE CASCADE,
     pays_origine text NOT NULL,
     denomination_legale_officielle text NOT NULL,
     nom_commercial_international text,
     numero_immatriculation_origine text,
     type_identifiant_registre text,        -- ex. "Company Number", "SIREN", "EIN"
     nom_registre_origine text,             -- ex. "Companies House", "RCS", "Delaware Division of Corporations"
     siege_social_origine text,
     site_web_officiel text,
     type_structure_internationale text,    -- ex. "société mère", "groupe", "société indépendante étrangère"
     statut_presence_guinee text NOT NULL CHECK (statut_presence_guinee IN (
       'societe_guineenne_groupe_etranger', 'filiale', 'succursale',
       'bureau_representation', 'prestataire_depuis_etranger',
       'partenariat_representation_locale', 'autre_a_verifier'
     )),
     zone_intervention text,                -- libre : "toute la Guinée", "Conakry uniquement", "à distance depuis l'étranger", etc.
     cree_le timestamptz NOT NULL DEFAULT now(),
     modifie_le timestamptz
   );
   ```
   RLS : activé, aucune policy (`service_role` uniquement — même
   convention que `documents_institution`).
3. **`institutions.origine_type`** — nouvelle colonne simple :
   ```sql
   ALTER TABLE institutions ADD COLUMN origine_type text NOT NULL DEFAULT 'guinee'
     CHECK (origine_type IN ('guinee', 'etrangere'));
   ```
   **Attribut d'identité pur** — n'intervient dans aucun calcul de
   catégorie/activité/CTA (même garde-fou déjà appliqué à `secteur` vis-
   à-vis du CTA, §15).
4. **Vérification** : une organisation `origine_type='etrangere'` avec
   `institution_identite_internationale` renseignée mais **sans**
   `verification_decisions` favorable sur l'axe `identite` reste au
   niveau `profil_basique` (`niveau_confiance`, valeur déjà existante
   par défaut) — aucun badge vérifié tant que l'admin n'a pas validé,
   exactement le même principe que pour une institution guinéenne
   aujourd'hui.

### 3ter.1 — Politique d'admissibilité tranchée (décision CEO du 20/08/2026)

**Principe validé** : une organisation étrangère est admissible dès
qu'elle opère réellement en Guinée — **aucune exigence administrative
uniforme** (pas de RCCM guinéen systématique). En contrepartie, **aucune
organisation étrangère n'est publiée sur simple déclaration** : le
système identifie son mode de présence réel et exige les justificatifs
adaptés à ce mode précis, jamais un gabarit unique.

| `statut_presence_guinee` | Justificatifs adaptés | Publication (`institutions.statut='validee'`) |
|---|---|---|
| `filiale` | RCCM guinéen (déjà exigé par `statut_juridique=prive_formel`, mécanisme existant inchangé) + `immatriculation_etrangere` de la société mère | Après décision favorable axe `identite` sur les deux preuves |
| `succursale` | `immatriculation_etrangere` de la maison mère + justificatif d'enregistrement local si le mode d'exploitation choisi l'exige (dépend du `statut_juridique` déclaré — pas d'exigence RCCM automatique distincte de celle déjà pilotée par `statut_juridique`) | Idem |
| `bureau_representation` | `immatriculation_etrangere` + preuve d'existence du bureau en Guinée (bail, autorisation d'ouverture le cas échéant) — **pas de RCCM exigé par défaut**, un bureau de représentation n'exerce généralement pas d'activité commerciale directe | Idem |
| `prestataire_depuis_etranger` | `immatriculation_etrangere` + preuve d'activité réelle vers le marché guinéen (contrat, client, partenaire local documenté, ou tout justificatif démontrant un usage réel) — **pas de RCCM, pas d'ancrage local imposé par principe** | Idem, sur la seule preuve d'activité réelle |
| `partenariat_representation_locale` | `immatriculation_etrangere` du mandant + preuve du mandat/partenariat de représentation | Idem |
| `autre_a_verifier` | Examen manuel au cas par cas, aucun justificatif prédéfini tant que le statut réel n'est pas clarifié par l'institution | Reste `a_examiner` tant que le statut n'est pas clarifié |

**Règle non négociable** : si le mode de présence ou la réalité de
l'activité en Guinée **ne peut pas être suffisamment établie**, la
décision `verification_decisions` (axe `identite`) reste au statut
`complement_demande` (valeur déjà existante dans le système Trust,
`lib/documentsInstitution.ts`/Lot Trust — aucune nouvelle valeur
d'énumération nécessaire) — et l'institution **n'est jamais publiée
automatiquement** : `institutions.statut` doit rester différent de
`validee` pour toute organisation étrangère tant que cette décision
n'est pas favorable. C'est une extension du gate d'admin déjà existant
(`app/api/admin/institutions/[id]/valider/route.ts`), pas un nouveau
mécanisme de statut — l'admin ne doit simplement pas valider une
institution étrangère avant que l'axe `identite` international soit
tranché favorablement.

**Objectif confirmé** : pas d'exigence administrative uniforme pour
toutes les organisations étrangères, mais garantie que toute
organisation étrangère visible sur Yelen (a) opère réellement en Guinée
et (b) possède une identité vérifiable — les deux conditions, jamais
l'une sans l'autre. **Point précédemment ouvert, désormais tranché —
plus de décision CEO en attente sur ce sujet.**

---

## 4. Catégories finales — réexamen critique demandé par le CEO

**Méthode** : chaque catégorie évaluée sur nécessité, chevauchement,
importance réelle en Guinée (quand une source existe, §18), adéquation
au périmètre Yelen, clarté pour un utilisateur normal.

| # | Catégorie | Verdict | Justification |
|---|---|---|---|
| 1 | Institutions publiques & services administratifs | **Conservée telle quelle** | Distincte, cœur historique de Yelen (mairies, ambassades — CLAUDE.md `/rappel-fondamental`) |
| 2 | Santé & services médicaux | **Conservée** | Distincte, réglementée (§10), cœur historique de Yelen |
| 3 | Finance, assurance & paiements | **Conservée** | Distincte, réglementée par la BCRG (§10, SOURCE OFFICIELLE) |
| 4 | Droit, comptabilité & conseil professionnel | **Conservée, périmètre resserré** | Voir règle de frontière ci-dessous — "conseil" générique (stratégie, management) retiré au profit de la catégorie 14 ; ne garde que les professions réglementées par ordre (avocat, notaire, expert-comptable) + conseil juridique/fiscal directement lié |
| 5 | Technologie, numérique & télécommunications | **Conservée, détaillée §6** | Catégorie stratégique du mandat |
| 6 | Éducation, formation & recherche | **Conservée** | Distincte, réglementée (§10, SOURCE OFFICIELLE service-public.gov.gn) |
| 7 | Hébergement, restauration & événements | **Conservée** | Absorbe l'activité "Hôtellerie" (ex-`secteur=hotel`, chantier du 19/08/2026) sans perdre sa spécificité — voir note de continuité ci-dessous |
| 8 | Transport, logistique & mobilité | **Conservée** | Distincte, en partie réglementée |
| 9 | BTP, immobilier & services techniques | **Conservée, note de frontière avec Artisanat** | Voir ci-dessous |
| 10 | Agriculture, élevage & services ruraux | **Conservée** | Secteur économique dominant en Guinée (donnée macro connue, pas vérifiée par source primaire dans ce mandat) |
| 11 | Artisanat, fabrication & réparation | **Conservée, note de frontière avec BTP** | Voir ci-dessous |
| 12 | Beauté, bien-être & sport | **Conservée** | Cohérente (logique "prise de RDV personnel"), cœur du cas d'usage RDV Yelen |
| 13 | Communication, médias & création | **Conservée, périmètre clarifié face à la Technologie** | Voir règle de frontière ci-dessous |
| 14 | Services aux entreprises & externalisation | **Conservée, élargie** | Absorbe le "conseil" générique retiré de la catégorie 4 |
| 15 | Associations, ONG & organisations professionnelles | **Conservée** | Distincte, réalité guinéenne significative (nombreuses ONG) |

**Aucune fusion, aucune suppression** — les 15 tiennent structurellement.
**Deux règles de frontière ajoutées** (pas des catégories nouvelles, des
clarifications de périmètre) :

1. **Droit/Comptabilité/Conseil (4) vs Services aux entreprises (14)** :
   la catégorie 4 se limite aux professions **réglementées par un ordre
   professionnel** (avocat, notaire, expert-comptable) et au conseil
   juridique/fiscal strictement lié à ces professions. Le conseil en
   gestion/stratégie/management générique (non réglementé) appartient à
   la catégorie 14.
2. **Technologie (5) vs Communication, médias & création (13)** : la
   catégorie 5 couvre les activités à **exécution technique**
   (développement, infrastructure, plateformes, y compris la
   *mise en œuvre* technique du marketing digital/réseaux sociaux/
   contenu numérique — activités explicitement listées côté Techno par
   le CEO). La catégorie 13 couvre la **création/stratégie de contenu et
   de marque** (agence de communication classique, graphisme, presse,
   production audiovisuelle). Une "agence digitale" au sens technique
   (développement, intégration) → Techno ; une agence de communication/
   création → Catégorie 13. Cette frontière reste ténue et devra être
   arbitrée au cas par cas pour les demandes ambiguës (file "Autre
   activité", §11) — signalé honnêtement comme un point de friction
   durable, pas résolu de façon définitive ici.
3. **BTP (9) vs Artisanat (11)** : BTP = construction/immobilier à
   l'échelle d'un bâtiment/chantier (entreprise de construction, bureau
   d'études, gros œuvre) ; Artisanat = savoir-faire individuel/atelier à
   l'échelle d'un objet ou d'une prestation ponctuelle (menuiserie sur
   mesure, réparation, couture). Un électricien indépendant réalisant
   des installations résidentielles ponctuelles → Artisanat ; une
   entreprise d'électricité intervenant sur des chantiers BTP → BTP.

**Catégorie envisagée puis explicitement écartée** : organisations
religieuses/cultuelles (mosquées, églises). Écartée car hors du
périmètre "prise de RDV avec une institution/prestataire" qui définit
Yelen aujourd'hui (CLAUDE.md `/rappel-fondamental`, `/identite`) — aucune
preuve dans le produit actuel que ce cas d'usage soit visé. **Pas ajoutée
sans validation CEO explicite si le besoin apparaît réellement.**

**Vérifié contre la règle géographique (§3bis)** : les 15 catégories
ci-dessus n'ont nécessité **aucun ajout ni aucune modification** pour
couvrir les organisations étrangères — une filiale, une succursale ou un
prestataire étranger se classe par ce qu'il **fait** (une des 15
catégories existantes), jamais par son origine. Aucune catégorie
« Entreprises étrangères »/« International » n'existe dans ce tableau,
conforme à l'instruction explicite du CEO.

**Note de continuité — Hôtel** : `secteur = "hotel"` (chantier du
19/08/2026, `docs/ui/YELEN_HOTEL_MODEL_AUDIT.md`) devient, dans le
nouveau modèle, l'activité **"Hôtellerie"** sous la catégorie 7. Le
gating `isHotel` actuellement basé sur `inst.secteur === "hotel"`
(`InstitutionPublicClient.tsx`, `page.tsx` du dashboard) devra migrer
vers un test sur `activite_principale.code === "hotellerie"` **au
moment de l'implémentation de cette taxonomie**, pas avant — jusque-là,
`secteur="hotel"` continue de fonctionner sans changement (§13).

---

## 5. Activités exactes — méthode de sourcing

Chaque activité ci-dessous est annotée d'un niveau de confiance et d'un
type de source, conformément à l'exigence du CEO :

- **SOURCE OFFICIELLE** : texte de loi, décret, arrêté, ou site
  institutionnel gouvernemental guinéen (`.gov.gn`, BCRG, ARPT).
- **SOURCE SECTORIELLE** : ordre professionnel, régulateur de secteur,
  organisation professionnelle reconnue (CCIAG).
- **SOURCE COMMERCIALE/ANNUAIRE** : annuaire d'entreprises, presse
  économique — indicatif de la réalité du marché, jamais une preuve de
  reconnaissance officielle.
- **INFÉRENCE PRODUIT YELEN** : déduction raisonnable (bon sens produit,
  cohérence avec les activités déjà sourcées) en l'absence de source
  primaire vérifiée dans cet environnement — **jamais présentée comme
  officielle**.

**Limite honnête, comme pour l'audit précédent** : les recherches
effectuées pour cette spécification (§18) couvrent solidement les
secteurs réglementés (finance, télécoms, santé, éducation, sécurité
privée) mais **pas** une revue exhaustive de la NAEMA/CCIAG pour les 15
catégories — le brief lui-même précise que NAEMA/CGAP servent de
"référence de couverture et de contrôle, pas d'interface utilisateur",
donc une correspondance ligne à ligle n'a pas été recherchée. Les
catégories non réglementées (artisanat, agriculture, BTP, transport,
beauté, communication, associations) restent au niveau **INFÉRENCE
PRODUIT YELEN**, à consolider dans un second passage dédié.

---

## 6. Catégorie 5 — Technologie, numérique & télécommunications (détaillée)

### 6.1 Où placer chaque notion : Catégorie / Activité / Service / Mot-clé

| Notion citée par le CEO | Niveau | Justification |
|---|---|---|
| Technologie, numérique & télécommunications | **Catégorie** | Regroupement large, fixe |
| Développement logiciel/web/mobile, SaaS, agence digitale, conseil/intégration/infogérance informatique, infrastructure réseau, hébergement/cloud, cybersécurité, fournisseur SMS/USSD, solutions de paiement numérique, fintech, IA/données, formation informatique, FAI, opérateur télécom, téléphonie d'entreprise, centre de données, vente+maintenance matériel | **Activité** | Chacune décrit un métier distinct, un modèle d'affaires reconnaissable |
| SMS transactionnels, OTP, campagnes SMS, API SMS, notifications, intégration plateforme (exemple CEO pour SMS) | **Service** | Ce que l'activité propose concrètement, texte libre par institution |
| DevOps, Blockchain, Web3, No-code, Microservices, UX Research, Data Engineering, Réalité augmentée | **Mot-clé/spécialité** (jamais une activité) | Volume insuffisant pour justifier une activité indépendante — vivent comme service texte libre ("DevOps" comme service d'une institution "Développement logiciel") ou comme alias futur si le volume réel le justifie un jour |
| Communication numérique, marketing digital, gestion réseaux sociaux, production de contenu numérique | **Activité** (dans Techno, par décision CEO explicite — cf. tension avec Catégorie 13 documentée §4) | Listées explicitement par le CEO sous Techno à deux reprises (spec précédente et ce mandat) — respecté tel quel malgré le chevauchement conceptuel avec la Communication/création |

### 6.2 Table complète des activités (format demandé par le CEO)

| Activité | Définition courte | Exemples d'organisations | Services typiques | Alias/mots-clés | Activités proches mais différentes | À exclure | Confiance | Source |
|---|---|---|---|---|---|---|---|---|
| **Fournisseur de solutions SMS** | Entreprise fournissant des services professionnels d'envoi, réception, automatisation ou intégration SMS. | Nimba SMS (cas de test, §16) | SMS transactionnels, OTP, campagnes SMS, API SMS, notifications, intégration plateforme | SMS provider, plateforme SMS, service SMS, passerelle SMS, SMS API | Opérateur télécom, agence marketing, centre d'appels | Simple revente de cartes SIM/crédit sans plateforme | **Élevé** — activité réglementée (ARPT) confirmée par décret | **SOURCE OFFICIELLE** — Décret A/2021/086/MPTEN/CAB/SGG (ouverture des codes USSD/VAS), ARPT — un fournisseur SMS opérant via agrégation/API est un "fournisseur de services à valeur ajoutée" au sens de ce cadre |
| **Fournisseur de solutions USSD** | Entreprise fournissant des services interactifs accessibles par code USSD, agréée par l'ARPT. | — | Menus USSD, paiement USSD, notifications USSD | USSD provider, service USSD, code USSD | Fournisseur SMS, opérateur télécom | — | **Élevé** | **SOURCE OFFICIELLE** — même décret, ARPT approuve les fournisseurs de services à valeur ajoutée pour l'attribution de codes USSD |
| **Opérateur télécom** | Exploitant d'un réseau de télécommunications ouvert au public (licence 2G/3G/4G). | Ex. MTN-Guinée (cité par l'ARPT comme titulaire de licence) | Réseau mobile, internet mobile, itinérance | Opérateur mobile, télécommunications | Fournisseur d'accès Internet (peut être le même acteur, activité distincte si le service vendu diffère), fournisseur SMS/USSD (souvent client d'un opérateur, pas l'opérateur lui-même) | — | **Élevé** | **SOURCE OFFICIELLE** — Loi n°2005/018/AN, Loi L/2023/0008/CNT, ARPT (licences 2G/3G/4G confirmées, ex. MTN-Guinée) |
| **Fournisseur d'accès Internet** | Fournit un accès Internet fixe/mobile aux particuliers/entreprises. | — | Connexion fibre/ADSL/satellite, support technique | FAI, ISP | Opérateur télécom, centre de données | — | **Moyen** | **INFÉRENCE PRODUIT YELEN** — cadre ARPT général confirmé (régulateur télécoms/postes), autorisation FAI spécifique non vérifiée précisément dans ce mandat |
| **Développement logiciel** | Conception et réalisation de logiciels sur mesure pour des tiers. | — | ERP, applications métier, API | Dev logiciel, logiciel sur mesure | Développement web, développement mobile | Simple revente de licences logicielles sans développement | **Moyen** | **INFÉRENCE PRODUIT YELEN** — non réglementé spécifiquement, activité de bon sens |
| **Développement web** | Conception et réalisation de sites/applications web. | — | Site vitrine, e-commerce, application web | Dev web, création de site | Agence digitale, développement logiciel | — | **Moyen** | **INFÉRENCE PRODUIT YELEN** |
| **Développement mobile** | Conception et réalisation d'applications mobiles. | — | App Android/iOS, maintenance app | App mobile, dev mobile | Développement logiciel/web | — | **Moyen** | **INFÉRENCE PRODUIT YELEN** |
| **Plateforme SaaS / numérique** | Édition et exploitation d'un logiciel en ligne par abonnement. | — | Abonnement logiciel, support SaaS | SaaS, plateforme en ligne, solution logicielle | Développement logiciel (SaaS = un logiciel qu'on édite soi-même et exploite, distinct d'un dev sur commande pour un tiers) | — | **Moyen** | **INFÉRENCE PRODUIT YELEN** |
| **Agence digitale** (sens technique) | Agence proposant développement/intégration technique pour des tiers. | — | Site web, application, intégration | Agence web, agence numérique (technique) | Agence de communication (Catégorie 13, création/stratégie) | Agence purement créative sans exécution technique → Catégorie 13 | **Moyen** | **INFÉRENCE PRODUIT YELEN** — frontière avec Cat. 13 documentée §4 |
| **Conseil informatique** | Accompagnement stratégique/technique en systèmes d'information, sans exécution. | — | Audit SI, schéma directeur | Consulting IT, conseil IT | Intégration informatique (exécute), infogérance (opère) | — | **Moyen** | **INFÉRENCE PRODUIT YELEN** |
| **Intégration informatique** | Mise en œuvre technique de systèmes/logiciels tiers chez le client. | — | Déploiement ERP, interconnexion systèmes | Intégrateur, intégration système | Conseil informatique, infogérance | — | **Moyen** | **INFÉRENCE PRODUIT YELEN** |
| **Infogérance & maintenance informatique** | Prise en charge opérationnelle récurrente du SI d'un client. | — | Support informatique, maintenance IT, hotline | Infogérance, support IT | Intégration (ponctuelle), vente+maintenance matériel (matériel, pas SI complet) | — | **Moyen** | **INFÉRENCE PRODUIT YELEN** |
| **Infrastructure informatique et réseau** | Conception/déploiement de réseaux et infrastructures physiques/virtuelles. | — | Câblage réseau, Wi-Fi entreprise, datacenter local | Réseau, infrastructure IT | Centre de données (hébergement mutualisé), hébergement web/cloud | — | **Moyen** | **INFÉRENCE PRODUIT YELEN** |
| **Hébergement web & cloud** | Hébergement de sites/applications/infrastructures pour des tiers. | — | Hébergement mutualisé, VPS, cloud | Hébergement, cloud, infrastructure cloud | Centre de données, infrastructure réseau | — | **Moyen** | **INFÉRENCE PRODUIT YELEN** |
| **Cybersécurité** | Protection des systèmes d'information contre les menaces numériques. | — | Audit sécurité, pentest, surveillance | Sécurité informatique, sécurité IT | Sécurité privée (Catégorie 14 — physique, pas numérique) | Sécurité physique/gardiennage → Catégorie 14 | **Moyen** | **INFÉRENCE PRODUIT YELEN** |
| **Solutions de paiement numérique** | Fourniture de passerelles/API de paiement électronique (mobile money, cartes) pour des tiers. | — | Passerelle de paiement, API paiement, agrégation mobile money | Passerelle de paiement, agrégateur paiement | Fintech (plus large), opérateur télécom (mobile money natif d'un opérateur ≠ prestataire tiers) | — | **Moyen** | **INFÉRENCE PRODUIT YELEN** — sécurité des transactions >2M GNF avec double authentification confirmée par décret ARPT (contexte USSD), mais statut réglementaire précis d'un "prestataire de paiement" en tant que tel non vérifié séparément |
| **Fintech / technologie financière** | Développement de produits financiers innovants (hors établissement financier réglementé lui-même). | — | Scoring crédit, néobanque, gestion d'épargne digitale | Technologie financière | Finance/assurance/paiements (Catégorie 3 — l'établissement financier réglementé lui-même) | Une banque/microfinance/IMF réglementée → Catégorie 3, pas Techno | **Moyen** | **INFÉRENCE PRODUIT YELEN**, frontière avec Cat. 3 à surveiller (une fintech peut nécessiter un agrément BCRG selon son activité réelle — §10) |
| **Intelligence artificielle et données** | Conception de solutions IA/analyse de données pour des tiers. | — | Modèles prédictifs, tableaux de bord data | IA, data, analyse de données | Développement logiciel | — | **Faible** — aucune preuve de volume réel en Guinée dans ce mandat | **INFÉRENCE PRODUIT YELEN** |
| **Formation informatique** | Organisme dispensant des formations techniques en informatique/numérique. | — | Cours de programmation, certification | Formation IT, formation numérique | Éducation/formation (Catégorie 6 — formation généraliste) | Formation généraliste non technique → Catégorie 6 | **Moyen** | **INFÉRENCE PRODUIT YELEN** |
| **Téléphonie d'entreprise** | Solutions de téléphonie fixe/IP pour entreprises. | — | Standard téléphonique, téléphonie IP | Téléphonie IP, standard téléphonique | Opérateur télécom | — | **Faible** | **INFÉRENCE PRODUIT YELEN** |
| **Centre de données / services data** | Exploitation d'un datacenter ou de services d'hébergement de données à grande échelle. | — | Colocation, stockage de données | Datacenter, hébergement de données | Hébergement web/cloud | — | **Faible** | **INFÉRENCE PRODUIT YELEN** |
| **Vente et maintenance de matériel informatique** | Vente de matériel informatique **accompagnée** d'un service de maintenance/support (cf. §3, sinon hors périmètre). | — | Vente + support matériel, réparation matériel | Matériel informatique, vente + support IT | Infogérance (SI complet, pas seulement le matériel) | Vente de matériel **sans** service associé → hors périmètre Yelen (§3) | **Moyen** | **INFÉRENCE PRODUIT YELEN** |
| **Communication numérique / marketing digital / gestion réseaux sociaux / production de contenu numérique** | Exécution technique de campagnes/gestion de présence numérique pour des tiers. | — | Community management, campagnes publicitaires digitales, création de contenu | Marketing digital, community management, communication numérique | Catégorie 13 (création/stratégie de marque) — frontière documentée §4 | Agence de communication classique sans volet numérique → Catégorie 13 | **Moyen** | **INFÉRENCE PRODUIT YELEN**, classification imposée par le CEO malgré le chevauchement conceptuel (§4/§6.1) |

**Rappel explicite (conforme au brief)** : DevOps, Blockchain, Web3,
No-code, Microservices, UX Research, Data Engineering, Réalité augmentée
**ne sont pas dans ce tableau** — ce sont des services/mots-clés
possibles sous les activités ci-dessus (ex. "DevOps" comme service
déclaré par une institution "Infrastructure informatique et réseau" ou
"Développement logiciel"), jamais des lignes indépendantes tant que le
volume réel ne le justifie pas.

---

## 7. Les 14 autres catégories — squelette non consolidé (honnêteté explicite)

**Répété volontairement, conforme au principe CEO du §18** : ce qui suit
est un point de départ **INFÉRENCE PRODUIT YELEN**, pas une recherche
CCIAG/APIP/NAEMA activité-par-activité — ce travail de fond n'a pas été
fait dans ce mandat (limite de temps/accès, honnêtement déclarée plutôt
que masquée). Format réduit (pas les 10 colonnes complètes, réservées à
la Technologie comme demandé) :

| Catégorie | Activités de départ (À VALIDER, confiance faible-moyenne) |
|---|---|
| Institutions publiques & administratif | Mairie, Préfecture, Ambassade/Consulat, Service d'état civil, Administration fiscale |
| Santé & médical | Hôpital, Clinique, Cabinet médical, Pharmacie, Laboratoire d'analyses — **statuts réglementaires sourcés §10** |
| Finance, assurance & paiements | Banque, Microfinance, Assurance, Transfert d'argent/mobile money, Bureau de change — **statuts réglementaires sourcés §10** |
| Droit, comptabilité & conseil (périmètre resserré, §4) | Cabinet d'avocats, Notaire, Cabinet comptable — **statuts réglementaires sourcés §10** |
| Éducation, formation & recherche | École, Université, Centre de formation professionnelle, Institut de recherche — **statut réglementaire sourcé §10** |
| Hébergement, restauration & événements | **Hôtellerie** (continuité `secteur=hotel`, §4), Restaurant, Organisateur d'événements, Traiteur |
| Transport, logistique & mobilité | Transport de personnes, Transit/dédouanement, Livraison/messagerie, Location de véhicules |
| BTP, immobilier & services techniques | Entreprise BTP, Agence immobilière, Bureau d'études techniques, Électricité/plomberie (échelle chantier, §4) |
| Agriculture, élevage & services ruraux | Exploitation agricole, Coopérative agricole, Vétérinaire, Fourniture d'intrants agricoles |
| Artisanat, fabrication & réparation | Menuiserie/ameublement sur mesure, Couture/mode, Réparation automobile, Fabrication artisanale, électricien/plombier indépendant (échelle ponctuelle, §4) |
| Beauté, bien-être & sport | Coiffure, Institut de beauté/spa, Salle de sport, Coach sportif |
| Communication, médias & création | Agence de communication (création/stratégie, §4), Studio de production, Média/presse, Graphisme/design |
| Services aux entreprises & externalisation | Centre d'appels, Recrutement/RH, Nettoyage professionnel, **Sécurité privée** (statut réglementaire sourcé §10), Conseil en gestion (accueille le "conseil" retiré de la Cat. 4) |
| Associations, ONG & organisations | ONG, Association communautaire, Organisation professionnelle/syndicat |

---

## 8. Services (rappel de niveau)

Réutilisent le mécanisme **déjà existant** — aucune nouvelle structure
de données : `institutions.services` (jsonb, "offre gratuite/vitrine")
et `paid_services` (table dédiée, catalogue payant), déjà écrits et lus
par `ServicesTab.tsx` et la fiche publique. Le seul changement à ce
niveau : le dropdown de catégorie de service (`ServicesTab.tsx:62`,
actuellement `SECTEURS.map(s => s.label)`) devra à terme s'aligner sur
les nouvelles **activités**, pas les catégories (une institution
"Fournisseur de solutions SMS" propose des services SMS, pas des
services "Technologie" génériques) — détail d'implémentation, pas une
nouvelle donnée.

---

## 9. Alias (rappel de niveau)

`activites.alias` (array Postgres, §12) — synonymes de recherche curés
par Yelen, jamais publics comme "activité affichée". Distincts des
mots-clés/spécialités qu'une institution s'auto-attribue (niveau
Service, §8, texte libre, non curé). Un alias **améliore la recherche**,
il **ne change jamais** la classification affichée sur la fiche
publique — règle explicite du CEO (§10 du brief), reprise ici comme
contrainte de conception non négociable.

---

## 10. Commerce et frontière du périmètre

**Décision produit confirmée** : Commerce n'est pas et ne redevient pas
une catégorie Yelen, sous aucun nom déguisé. Grille de décision détaillée
§3. Aucune activité du tableau §6.2/§7 ne s'appelle "Commerce",
"Vente", "Boutique" ou équivalent — vérifié par relecture de chaque
ligne créée dans cette spécification.

---

## 10bis. Activités réglementées (`regulatory_status`)

Valeurs : `non_regulated`, `regulated`, `license_required`,
`accreditation_required`, `professional_order`, `verification_required`.
**Attribut distinct de la catégorie**, porté par l'activité (§12,
colonnes `regulatory_status`/`regulatory_source` sur `activites`).

| Activité | Statut proposé | Source | Type |
|---|---|---|---|
| Banque | `license_required` | BCRG, mission de supervision des banques confirmée (bcrg-guinee.org/missions/supervision) | **SOURCE OFFICIELLE** |
| Microfinance | `license_required` | Loi relative aux Institutions Financières Inclusives en République de Guinée, BCRG | **SOURCE OFFICIELLE** |
| Assurance | `license_required` | BCRG, supervision confirmée (banques/assurances/microfinance) | **SOURCE OFFICIELLE** |
| Opérateur télécom | `license_required` | Loi n°2005/018/AN, Loi L/2023/0008/CNT, ARPT (licences 2G/3G/4G, ex. MTN-Guinée) | **SOURCE OFFICIELLE** |
| Fournisseur de solutions SMS/USSD | `verification_required` (approbation ARPT en tant que fournisseur de services à valeur ajoutée, pas une "licence" au sens plein d'un opérateur) | Décret A/2021/086/MPTEN/CAB/SGG, ARPT | **SOURCE OFFICIELLE** |
| Pharmacie | `license_required` + `professional_order` | Loi L/2018/024/AN (Médicaments, Produits de Santé, Profession de Pharmaciens), Ordre National des Pharmaciens de Guinée (ONPG), autorisation du Ministre de la Santé après avis de la commission des agréments | **SOURCE OFFICIELLE** |
| Clinique / cabinet médical | `license_required` (déduit du cadre Ministère de la Santé applicable aux pharmacies, autorisation spécifique clinique non vérifiée séparément) | Ministère de la Santé et de l'Hygiène Publique | **SOURCE SECTORIELLE**, à confirmer |
| Médecin (exercice individuel) | `professional_order` | Ordre National des Médecins et Pharmaciens de Guinée | **SOURCE SECTORIELLE** |
| Avocat | `professional_order` | Ordre des Avocats de Guinée (Barreau) | **SOURCE SECTORIELLE** |
| Notaire | `professional_order` (probable, tradition civiliste guinéenne) | Non vérifié spécifiquement dans ce mandat | **INFÉRENCE PRODUIT YELEN — à confirmer** |
| Expert-comptable | `professional_order` (probable) | Ordre des experts-comptables mentionné génériquement, non confirmé pour la Guinée spécifiquement dans ce mandat | **INFÉRENCE PRODUIT YELEN — à confirmer** |
| Établissement d'enseignement privé (primaire/secondaire) | `accreditation_required` | Ministère de l'Enseignement Pré-Universitaire, agrément via Direction Préfectorale/Communale de l'Éducation | **SOURCE OFFICIELLE** (service-public.gov.gn) |
| Établissement d'enseignement supérieur privé | `accreditation_required` | Ministère de l'Enseignement Supérieur, procédure de création d'institution privée | **SOURCE OFFICIELLE** (service-public.gov.gn) |
| Sécurité privée | `license_required` | Décret D/2020/216/PRG (26/08/2020) + 4 arrêtés d'application, Ministère de la Sécurité et de la Protection Civile | **SOURCE OFFICIELLE** |
| Toutes les autres activités (Techno hors SMS/USSD, artisanat, transport non réglementé spécifiquement, agriculture, beauté, communication, associations) | `non_regulated` par défaut, sauf preuve contraire | — | **INFÉRENCE PRODUIT YELEN** |

**Ne jamais mélanger `regulatory_status` avec la catégorie ou
l'activité** — c'est un attribut orthogonal (une "Fournisseur de
solutions SMS" reste dans la catégorie Techno, réglementée ou non
n'affecte pas son classement, seulement un badge/information
complémentaire éventuel côté produit, non spécifié davantage dans ce
mandat).

---

## 11. « Autre activité » — flux formalisé

```
Catégorie (obligatoire)
  → Activité proposée dans la liste de cette catégorie
    → « Je ne trouve pas mon activité »
      → Libellé personnalisé (obligatoire)
      → Description obligatoire (« qu'est-ce que vous faites concrètement ? »)
      → Vérification blocklist (serveur, avant insertion)
      → statut = a_examiner
      → Revue Yelen (écran admin dédié)
        → A. Refus (note obligatoire, jamais un drop silencieux)
        → B. Rattachement à une activité existante (le libellé proposé devient un alias de l'activité existante si pertinent)
        → C. Création d'une nouvelle activité officielle (versionnée, §12)
```

**Règles, reprises et rendues exécutables** :
- « Autre » n'est **jamais** une activité publique définitive — tant que
  `statut != validee`, la fiche publique affiche "Activité en cours de
  validation par Yelen", jamais le libellé brut.
- **Blocklist serveur** (pas seulement éditoriale) sur le libellé
  normalisé (réutilise `normaliser()` de `lib/rechercheFuzzy.ts:28-32`) :
  rejet avant insertion si égal ou proche (tolérance 1-2 lettres via
  `correspondApproximativement`) à `commerce, business, service, divers,
  entrepreneur, vente`.
- Synonymes → gérés exclusivement par `activites.alias`, jamais par la
  création d'une activité en double.
- Activités similaires → fusionnées par l'admin au moment de la revue
  (option B ci-dessus), pas laissées à dériver.
- **Chaque nouvelle activité est versionnée** — toute création/
  modification de `activites` (label, description, statut) écrit une
  ligne dans `activite_historique` (append-only, §12), jamais une
  correction silencieuse en place (même discipline que
  `journal_activite`/`signalement_events`/`document_events`, CLAUDE.md
  `/pieges-techniques-connus`).
- **Chaque décision humaine est auditée** — table dédiée
  `activite_demande_decisions` (§12), pas un simple statut mis à jour
  sans trace de qui a décidé quoi et quand.

---

## 12. Modèle de données (confirmé, aucune migration créée)

**Sept tables au total avec l'ajout de l'identité internationale** (§3ter :
`institution_identite_internationale`, rattachée au système Yelen Trust
existant plutôt qu'à un nouveau mécanisme de vérification — détail
complet §3ter, non répété ici). Six tables ci-dessous, mapping explicite
avec les noms conceptuels du CEO :

| Nom conceptuel CEO | Table réelle proposée | Écart et justification |
|---|---|---|
| `categories` | `activite_categories` | Renommage pour cohérence avec la convention française du projet (`institutions`, `rdv`, `signalements`...) |
| `activities` | `activites` | Idem |
| `activity_aliases` | `activites.alias text[]` (colonne, pas une table séparée) | Un array Postgres suffit pour une liste de synonymes sans métadonnée propre — évite une jointure systématique pour un besoin simple. Alternative en table séparée possible plus tard si un jour on a besoin d'analytics par alias individuel (fréquence de recherche par synonyme, etc.) — non nécessaire en V1 |
| `institution_activities` | `institution_activites` (table unique, primaire + secondaires) | Une seule table avec un flag `principale boolean`, plutôt qu'une FK directe + une table séparée pour les secondaires (design plus simple, plus proche de l'intention du CEO) |
| `activity_review_requests` | `activite_demandes` | Renommage |
| `activity_review_decisions` | `activite_demande_decisions` | Renommage, table séparée (pas une colonne sur la demande) pour permettre plusieurs décisions tracées dans le temps si une demande est réexaminée |
| `activity_services` (optionnel) | **Non créée** | Redondant avec `institutions.services`/`paid_services` déjà existants (§8) — créer une 3ᵉ structure de "services" dupliquerait une donnée déjà modélisée |
| `regulated_activity_requirements` (optionnel) | **Non créée en table** — 2 colonnes sur `activites` à la place | `regulatory_status`/`regulatory_source` suffisent en V1 (statut + source, pas une checklist de plusieurs exigences distinctes par activité). Si le besoin grandit (plusieurs documents/exigences par activité), le pattern `DOCUMENTS_PAR_STATUT_JURIDIQUE` de `lib/documentsInstitution.ts:23-81` est un précédent direct réutilisable pour une vraie table à ce moment-là — pas anticipé ici |
| `activity_versions` | `activite_historique` (append-only) | Journal de changement, même pattern d'immuabilité que `journal_activite`/`signalement_events` déjà établi dans le projet — pas une table de versions complètes (trop lourd pour le besoin réel : savoir *qui a changé quoi et quand*, pas restaurer un état complet) |

### Schéma détaillé

```sql
CREATE TABLE activite_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  ordre integer NOT NULL DEFAULT 0,
  actif boolean NOT NULL DEFAULT true,
  cree_le timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE activites (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  categorie_id uuid NOT NULL REFERENCES activite_categories(id),
  code text NOT NULL UNIQUE,
  label text NOT NULL,
  description text,
  alias text[] NOT NULL DEFAULT '{}',
  statut text NOT NULL DEFAULT 'active' CHECK (statut IN ('active','desactivee')),
  regulatory_status text NOT NULL DEFAULT 'non_regulated'
    CHECK (regulatory_status IN ('non_regulated','regulated','license_required','accreditation_required','professional_order','verification_required')),
  regulatory_source text,
  cree_le timestamptz NOT NULL DEFAULT now()
);

-- Historique append-only — jamais de UPDATE/DELETE sur activites sans
-- écrire ici d'abord (même discipline que journal_activite).
CREATE TABLE activite_historique (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  activite_id uuid NOT NULL REFERENCES activites(id),
  champ text NOT NULL,          -- 'label' | 'description' | 'statut' | ...
  ancienne_valeur text,
  nouvelle_valeur text,
  modifie_par_admin_id uuid REFERENCES admin_users(id),
  modifie_le timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE institutions
  ADD COLUMN activite_categorie_id uuid REFERENCES activite_categories(id);

CREATE TABLE institution_activites (
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  activite_id uuid NOT NULL REFERENCES activites(id),
  principale boolean NOT NULL DEFAULT false,
  ordre integer NOT NULL DEFAULT 0,
  PRIMARY KEY (institution_id, activite_id)
);
-- Contrôle applicatif (route API), pas un CHECK SQL : exactement 1 ligne
-- principale=true par institution, maximum 3 secondaires — même
-- discipline légère que capacite_par_creneau/paid_services.

CREATE TABLE activite_demandes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  categorie_id uuid NOT NULL REFERENCES activite_categories(id),
  libelle_propose text NOT NULL,
  description text NOT NULL,
  statut text NOT NULL DEFAULT 'a_examiner'
    CHECK (statut IN ('a_examiner','validee','rattachee','refusee')),
  cree_le timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE activite_demande_decisions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  demande_id uuid NOT NULL REFERENCES activite_demandes(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('validee','rattachee','refusee')),
  activite_resultante_id uuid REFERENCES activites(id),  -- créée ou rattachée
  note text,
  decide_par_admin_id uuid NOT NULL REFERENCES admin_users(id),
  decide_le timestamptz NOT NULL DEFAULT now()
);
```

**RLS** : `activite_categories`/`activites` — lecture publique
(`actif=true`/`statut='active'`), écriture `service_role` uniquement.
`activite_historique`/`activite_demandes`/`activite_demande_decisions`
— RLS activé, aucune policy (`service_role` uniquement, même convention
que le reste du projet). `institution_activites` — lecture publique via
jointure institution déjà publique, écriture `service_role`.

**Objectif du CEO atteint** : ajouter/désactiver/renommer une activité
se fait par une ligne en base (via l'écran admin de modération, §11),
**jamais** par une modification de fichier TypeScript ni un
redéploiement — seule la métadonnée visuelle (couleur/icône, 15 entrées
par catégorie, §4.3 de la version précédente) reste en code, exactement
comme `SECTEUR_COLORS`/`SecteurIcon` le sont déjà aujourd'hui pour
`secteur`.

---

## 13. Recherche

**Règle explicite reprise et confirmée** : une recherche doit trouver
une organisation par nom, catégorie, activité principale, activité
secondaire, alias, service, mot-clé — **les alias servent la recherche,
ils ne changent jamais la classification affichée**.

**Mécanique proposée (aucune nouvelle dépendance)** : pour un terme tapé
`t`, une institution est un résultat si `correspondApproximativement(t,
X)` est vrai pour au moins un `X` parmi : `inst.name`,
`activite_categorie.label`, `activite_principale.label`, `label` de
chaque activité secondaire, chaque élément de `alias` de ces activités,
chaque élément de `inst.services`/`paid_services.nom`. Fonction
existante `lib/rechercheFuzzy.ts:38` réutilisée telle quelle, aucune
réécriture.

**Non-objectif explicite** : le moteur ne transforme jamais
automatiquement une occurrence de terme en nouvelle activité — la
recherche est un consommateur en lecture seule de la taxonomie, jamais
un contributeur.

---

## 14. Migration des données existantes

**Principe non négociable, repris du brief** : aucun reclassement
automatique par mot-clé. Séquence :

1. Identifier les institutions existantes (`SELECT * FROM institutions
   WHERE secteur IS NOT NULL` — déjà exécuté le 20/08/2026 : **2
   institutions**, `financier`: 1, `services_divers`: 1, aucune autre
   valeur trouvée).
2. Afficher leur classification actuelle (`secteur`, `name`,
   `description`, `services` réels) — déjà disponible dans les résultats
   obtenus.
3. Proposer une correspondance **catégorie** mécanique (table `secteur`
   → `activite_categorie`, §4/§7) — fiable, un seul niveau, sans
   ambiguïté.
4. **L'activité principale exacte reste une décision humaine**, ligne par
   ligne, jamais automatisée (2 institutions seulement à ce jour = travail
   trivial).
5. Validation humaine par Bryan avant tout `UPDATE`.
6. Trace de la décision : `activite_historique` n'est pas destiné à ce
   cas (c'est pour les changements d'`activites`, pas d'institutions) —
   pour la migration initiale, un simple commentaire dans la migration
   SQL elle-même suffit (2 lignes, pas un besoin de table dédiée pour un
   volume aussi faible).
7. **Réversibilité** : `secteur`/`category` ne sont **pas** supprimées
   pendant cette migration — elles deviennent des colonnes legacy en
   lecture seule, permettant un retour arrière à tout moment tant que
   leur dépréciation complète n'est pas actée séparément (décision CEO
   distincte, non demandée ici).

---

## 15. Impact technique (re-vérifié, tableau complet demandé)

| Surface | Lecture actuelle | Nouvelle source | Impact | Migration nécessaire ? | Risque |
|---|---|---|---|---|---|
| Wizard inscription (`ActiviteStep.tsx`) | `secteur` (`SECTEURS`, `lib/institutionTaxonomy.tsx`) | `activite_categorie_id` + `activite_principale_id` (API `/api/taxonomie/activites`) | **Direct** — 2 sélections au lieu d'une + activités secondaires optionnelles | Oui — écran refondu | Moyen (allongement du flux, UX à valider) |
| Fiche publique — badge (`InstitutionPublicClient.tsx:113-124,876-877,1039`) | `secteur` (`SECTEUR_META/LABELS/ICON`) | `activite_categorie` (couleur/icône, §4.3) + `activite_principale.label` (texte précis affiché) | **Direct** — badge plus riche (catégorie + activité exacte) | Oui | Faible — repli déjà géré (`\|\| Icons.Building`) |
| Dashboard `ServicesTab.tsx:62,66` | `SECTEURS.map(s => s.label)` | Liste des activités de la catégorie de l'institution | **Direct** — dropdown catégorie de service devient dropdown d'activités | Oui | Faible |
| Dashboard `ProfilEntrepriseTab.tsx` | `SECTEURS`/`SecteurIcon` | Sélecteur catégorie+activité (même écran que le wizard) | **Direct** | Oui | Faible |
| Recherche/filtres (`RechercheInner.tsx:846`) | `category` (legacy) | **Inchangé dans ce mandat** — hors périmètre explicite | **Aucun** | Non | **Aucun** |
| Cartes (`CarteMapHome.tsx`) | `category` (legacy) | **Inchangé** | **Aucun** | Non | **Aucun** |
| KPI admin (`kpis/route.ts:62-134`) | `category` (mal nommée "secteurs") | **Inchangé dans ce mandat** — documenté §16, corrigé séparément après que la nouvelle taxonomie existe | **Aucun immédiat** | Non (différé) | **Aucun immédiat** |
| Offres partenaires (`offres.categorie`) | Namespace séparé (`commerce_pme` etc.) | **Inchangé** | **Aucun** | Non | **Aucun** |
| CTA (`lib/prestataireCapacites.ts`) | Rien (capacités réelles uniquement) | **Inchangé** | **Aucun** — confirmé une nouvelle fois par relecture (§16) | Non | **Aucun** |
| Administration (`admin/institutions/page.tsx:171`) | `category` (mal étiqueté "Secteur") | Différé — voir §16 | Documenté, non corrigé maintenant | Non (différé) | Bug préexistant, pas aggravé |
| Centres d'intérêt citoyen (`lib/centresInteret.ts`) | Copie indépendante des ids `secteur` | Décision produit séparée, non requise techniquement | Aucun impact technique si non touché | Non | Aucun si laissé tel quel |

**Confirmation de l'audit précédent** : le rayon d'impact technique
direct reste limité aux **3 mêmes surfaces** (wizard, badge fiche
publique, `ServicesTab.tsx`) — aucune surface supplémentaire découverte
en re-vérifiant.

---

## 16. Bug admin existant — documenté, non corrigé

**Comportement actuel** : `app/admin/institutions/page.tsx:156,171`
affiche une colonne intitulée "Secteur" mais dont la valeur réelle est
`inst.category` (`secteur: <span>{inst.category || '—'}</span>`).
`app/api/admin/kpis/route.ts:62` (`.select('category')`) alimente un
objet nommé `secteursData`/`secteurCounts`/`secteursArr` (lignes 87,
125-134), exposé au client comme `kpis.secteurs`
(`app/admin/adminTypes.ts:31`), affiché "Secteurs institutions"
(`app/admin/page.tsx:283-286`, `app/admin/analytiques/page.tsx:45-48`).

**Comportement attendu** : ces deux écrans devraient refléter la
**catégorie Yelen réelle** de l'institution (nouvelle
`activite_categorie_id` une fois la migration faite), pas la donnée
legacy cassée.

**Nouvelle source de vérité** : `institutions.activite_categorie_id`
(jointure vers `activite_categories.label`), une fois §12 implémenté.

**Migration prévue** : **différée explicitement** jusqu'à ce que la
nouvelle taxonomie existe réellement en base et que les institutions
aient une `activite_categorie_id` renseignée — corriger ces 2 fichiers
avant reviendrait à remplacer un champ cassé (`category`, NULL
silencieux) par un champ à peine mieux peuplé (`secteur`, 2 institutions
aujourd'hui), sans résoudre le problème de fond. **Ne pas toucher ces 2
fichiers avant l'implémentation complète de cette spécification.**

---

## 17. Cas Nimba SMS (test de non-régression officiel)

```
Institution : Nimba SMS
Catégorie   : technologie_numerique_telecom (Technologie, numérique & télécommunications)
Activité principale : fournisseur_solutions_sms (Fournisseur de solutions SMS)
Activités secondaires : (aucune pour ce test)
Services    : SMS transactionnels, OTP, campagnes SMS, API SMS, notifications
Alias (activité) : SMS provider, plateforme SMS, service SMS, passerelle SMS, SMS API
regulatory_status : verification_required (§10bis)
```

**Doit être trouvable par** (chacun testé indépendamment) :
1. `"Nimba SMS"` → correspond à `inst.name`.
2. `"SMS"` → correspond à un mot de l'alias (`SMS provider`, `SMS API`,
   etc., via `correspondApproximativement`).
3. `"solutions SMS"` → correspond au label exact de l'activité.
4. `"API SMS"` → correspond à l'alias `SMS API`.
5. `"services SMS"` → à ajouter explicitement à la liste d'alias à
   l'implémentation (non couvert par une simple tolérance Levenshtein
   sur les alias actuels — noté comme action requise, pas un oubli
   silencieux).

**Doit rester cohérent avec le CTA (test croisé, déjà validé le
18/08/2026 pour ce cas précis)** : `hasWebsite=true`, `hasBooking=false`
→ CTA "Découvrir", **indépendamment** de la catégorie/activité —
`lib/prestataireCapacites.ts` ne lit ni `secteur` ni la nouvelle
taxonomie, confirmé une nouvelle fois §15.

**Ce test devient un test de non-régression permanent** — à exécuter à
chaque modification future du moteur de recherche ou de la taxonomie
(aucun framework de test automatisé dans le projet à ce jour, CLAUDE.md
`/protocole` — exécution manuelle jusqu'à décision de stack séparée).

---

## 18. Sources et niveau de confiance

| Source | Type | Utilisée pour |
|---|---|---|
| BCRG — bcrg-guinee.org (mission de supervision, loi institutions financières inclusives) | **SOURCE OFFICIELLE** | Banque, microfinance, assurance (§10bis) |
| ARPT — arpt.gov.gn, Loi n°2005/018/AN, Loi L/2023/0008/CNT, Décret A/2021/086/MPTEN/CAB/SGG | **SOURCE OFFICIELLE** | Opérateur télécom, fournisseur SMS/USSD (§10bis) |
| Ministère de la Santé et de l'Hygiène Publique, Loi L/2018/024/AN, ONPG | **SOURCE OFFICIELLE / SECTORIELLE** | Pharmacie (§10bis), clinique (inféré, à confirmer) |
| Ordre National des Médecins et Pharmaciens de Guinée (professionnels-sante-guinee.org) | **SOURCE SECTORIELLE** | Médecin (§10bis) |
| Ordre des Avocats de Guinée | **SOURCE SECTORIELLE** | Avocat (§10bis) |
| service-public.gov.gn (Ministère Enseignement Pré-Universitaire, Ministère Enseignement Supérieur) | **SOURCE OFFICIELLE** | Établissements d'enseignement privés (§10bis) |
| Décret D/2020/216/PRG + arrêtés, Ministère de la Sécurité et de la Protection Civile (guinee360.com, guineenews.org relayant le texte officiel) | **SOURCE OFFICIELLE (relayée par presse économique)** | Sécurité privée (§10bis) |
| CCIAG — cciag.org.gn, décret statutaire (guineenews.org) | **SOURCE SECTORIELLE** | Rôle de la carte professionnelle de commerçant, périmètre Commerce/Industrie/Artisanat/BTP/Services (contexte §3) |
| APIP — apip.gov.gn, invest.gov.gn | **SOURCE OFFICIELLE** | Secteurs d'investissement prioritaires (agrobusiness, infrastructures, énergie, tourisme, numérique) — contexte macro, pas une nomenclature d'activités |
| AFRISTAT/INS — NAEMA rev1 (afristat.org) | **SOURCE OFFICIELLE (référentiel statistique)** | Confirmation que la NAEMA existe et sert de référentiel de couverture (17 sections, 60 divisions, 149 groupes, calqué sur la CITI) — **explicitement pas utilisée comme interface utilisateur**, conforme à l'instruction du CEO |
| Toutes les activités des catégories 1-4, 6-15 non listées au §10bis | **INFÉRENCE PRODUIT YELEN** | Squelette §7, à consolider dans un second passage |

**Ce qui n'a délibérément PAS été fait** : une correspondance
exhaustive ligne à ligne entre les 15 catégories Yelen et la NAEMA/CITI
(149 groupes) — le brief lui-même écarte cet usage ("elles ne doivent
PAS être une copie brute"). Une revue approfondie CCIAG/APIP
activité-par-activité pour les 14 catégories non détaillées (§7) —
limite de temps/accès explicitement déclarée, pas masquée.

---

## 19. Décisions CEO — statut final (validées le 20/08/2026)

**A. Architecture technique** — base de données (7 tables avec
l'identité internationale, §12/§3ter) plutôt qu'un fichier TypeScript.
**✅ VALIDÉ.**

**B. Les 15 catégories + les 3 règles de frontière** (Droit/Conseil
resserré vers les ordres professionnels ; Techno vs Communication
numérique tranché en faveur de Techno par fidélité au brief ; BTP vs
Artisanat par échelle d'intervention) — aucune fusion ni suppression,
catégorie "cultes/religieux" explicitement écartée. **✅ VALIDÉ.**

**C. Le contenu détaillé de Technologie & numérique** (24 activités,
table complète §6.2, statut réglementaire `verification_required` pour
SMS/USSD sourcé par décret ARPT réel). **✅ VALIDÉ.**

**D. Le lancement avec le squelette "à valider" pour les 14 autres
catégories** (§7), consolidation différée, absorbée par la file "Autre
activité" au fil de l'eau. **✅ VALIDÉ.**

**E. Le flux "Autre activité" complet** (blocklist serveur, écran admin
de décision, versionnement `activite_historique`, décisions auditées
`activite_demande_decisions`), à livrer en même temps que le formulaire
institution. **✅ VALIDÉ.**

**F. La stratégie de migration** (`secteur`/`category` gelées en
lecture seule, jamais supprimées ; reclassement manuel institution par
institution, aucun automatisme par mot-clé ; correction du bug admin
§16 explicitement différée après cette migration). **✅ VALIDÉ.**

**G. Périmètre géographique et identité internationale** (§3bis/§3ter)
— **✅ VALIDÉ AVEC MODIFICATION (décision CEO du 20/08/2026, intégrée
§3ter.1)** : aucune exigence administrative uniforme pour les
organisations étrangères (pas de RCCM guinéen systématique) ; les
justificatifs requis dépendent du mode de présence réel
(`statut_presence_guinee`, table §3ter.1) ; aucune publication sur
simple déclaration — statut `complement_demande` (axe `identite`,
système Trust existant) et `institutions.statut != 'validee'` tant que
le mode de présence et la réalité de l'activité en Guinée ne sont pas
suffisamment établis. **Plus aucun point ouvert.**

---

**Spécification entièrement validée (A-G). Aucun code, aucune migration
SQL, aucune modification de production, aucune donnée modifiée à aucun
moment de ce mandat — conforme à l'instruction explicite du CEO de
s'arrêter après ce document. L'implémentation reste un chantier séparé,
à ouvrir sur instruction explicite ultérieure.**
