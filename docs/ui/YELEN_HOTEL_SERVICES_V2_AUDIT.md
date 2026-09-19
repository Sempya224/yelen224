# Audit d'architecture — Services Hôtel V2 (20/08/2026)

Audit READ-ONLY demandé avant tout code (brief CEO, sections 14/15).
Aucun fichier modifié, aucune migration créée, aucun commit. Chaque
affirmation est sourcée fichier:ligne. Ce document répond aux points
A-L demandés en section 15 du brief.

---

## A. Architecture actuelle

Le dashboard institution a **un seul écran "Services" partagé par tous
les secteurs** (`ServicesTab.tsx`, 1266 lignes), qui gère en réalité
**deux catalogues distincts** :

1. **Offre générale** (`OffreGeneraleSection`, ouverte via le bouton
   "Offre gratuite") → écrit dans `institutions.services` (jsonb).
   Type `OffreService = { nom, description, duree_minutes,
   champs_complementaires }` — **aucun prix, aucune catégorie, aucune
   photo, aucun horaire**. C'est ce catalogue qui alimente la section
   "Chambres" de la fiche publique côté citoyen (`InstitutionPublicClient.tsx:1383-1406`,
   relabellage livré aujourd'hui même — voir tension §F).

2. **Services payants** (catalogue principal de l'écran, "Mes
   services") → table `paid_services` (`nom, prix, duree_minutes,
   description, categorie` texte libre, `champs_complementaires` jsonb,
   `is_active, taux_taxe, prix_promo, promo_actif`) + `paid_bookings`
   (réservations, cycle de vie `en_attente/confirme/termine/annule`).
   **`prix` est obligatoire et doit être `> 0`** côté API
   (`app/api/institution/services/route.ts:63,98`) — aucune notion de
   "gratuit/inclus" n'existe dans cette table aujourd'hui.

La fiche publique (citoyen) ne rend **jamais** `paid_services`
directement dans une liste : ce catalogue ne sert qu'à (a) compter les
services actifs pour le moteur de CTA global (`lib/prestataireCapacites.ts`,
un seul bouton par fiche, jamais par prestation), et (b) s'afficher
avec son prix **une fois que le citoyen a cliqué "Réserver"**, à
l'intérieur de l'assistant `/rdv/[id]` (`WizardService`, unifie
gratuit+payant, `app/rdv/[id]/page.tsx:634-643`).

**Détermination du mode Hôtel** : `activite_principale_code ===
"hotellerie"` (migré depuis `secteur === "hotel"` le 20/08/2026, chantier
Taxonomie des activités). C'est la référence CEO-validée du jour même
(`docs/product/YELEN_TAXONOMIE_ACTIVITES_SPEC.md`, §4 note de
continuité, statut **VALIDÉE**) — même discriminant déjà utilisé par
`ConfigurationHotelTab.tsx` et le relabellage "Chambres" livrés ce
tour-ci, aucun nouveau mécanisme à inventer ici.

**Taxonomie déjà en place, réutilisable comme précédent** : les tables
`activite_categories`/`activites` (chantier Taxonomie, migrations
`20260821000001`/`000002`) sont déjà un modèle **dynamique, curé en
base, pas codé en dur** — exactement le principe demandé en §3/§12 du
brief ("ne pas afficher automatiquement toutes les catégories"). Ce
n'est pas un système de "familles de prestations", mais c'est le
précédent architectural le plus proche dans le projet.

---

## B. Composants concernés

| Composant | Rôle actuel | Impact V2 |
|---|---|---|
| `ServicesTab.tsx` (1266 lignes) | Écran "Services" pour **tous** les secteurs | Ne doit **pas** être branché en profondeur (risque de régression sur les 14 autres catégories) — un composant séparé est plus sûr, voir §H |
| `InstitutionPublicClient.tsx` (2086+ lignes) | Fiche publique citoyen, section SERVICES/Chambres déjà relabellée pour l'hôtel | Doit rester **additif uniquement** (déjà la doctrine actée dans `docs/ui/YELEN_HOTEL_MODEL_AUDIT.md` Partie 12 — fichier durci P0, CTA V1 récent) |
| `app/institution/[id]/dashboard/page.tsx` | Gating des onglets (`activite_principale_code === "hotellerie"`), déjà le point d'entrée pour `ConfigurationHotelTab` | Même pattern à répliquer pour un éventuel nouvel onglet |
| `app/rdv/[id]/page.tsx` | Seul moteur de réservation existant (RDV/paid_bookings) | Aucun moteur de "commande" (room service) ni de "demande suivie" (ménage) n'existe — à construire entièrement, voir §F/§I |
| `lib/institutionPermissions.ts` | RBAC par `TabKey` | Nouvelle `TabKey` nécessaire si nouvel onglet dashboard séparé |
| `lib/prestataireCapacites.ts` | CTA unique par fiche, décision déterministe basée sur les capacités réelles | Précédent de style (déterministe, zéro donnée inventée) mais **pas** transposable tel quel : c'est une décision par fiche, le brief demande une décision **par prestation** |

---

## C/D. Données existantes réutilisables

- `paid_services` + `paid_bookings` + route `/api/institution/services`
  (auth membre, RLS contournée par service_role, validation serveur) —
  le seul moteur de réservation réel du projet. Réutilisable comme
  squelette pour "Réserver"/"Commander avec tarif".
- `institutions.services` (Offre générale) — déjà la source de
  "Chambres" côté citoyen (livré aujourd'hui). Pas de prix.
- `champs_complementaires` (`ChampComplementaire[]`) — pattern déjà
  existant pour des champs configurables par prestation, transposable
  à "conditions"/informations complémentaires par prestation.
- `activites`/`activite_categories` — précédent de taxonomie dynamique
  en base (voir §A), pas directement réutilisable comme table mais
  comme référence de conception.
- `lib/signalementsConstants.ts` + `signalement_events` (case
  management, 08/08/2026) — **précédent direct le plus proche** pour un
  système de demandes avec statuts (`SIGNALEMENT_TRANSITIONS`, graphe de
  transition **en code**, jamais en trigger DB — même discipline que le
  reste du projet, CLAUDE.md `/pieges-techniques-connus`).
- Système `messages` (citoyen↔institution) — pourrait porter "Contacter
  la réception" sans nouvelle infrastructure.

---

## E. Ce qui doit être remplacé (hôtel uniquement)

- Le concept structurant "Services payants" comme unique catalogue —
  remplacé, **pour le profil Hôtel seulement**, par une organisation en
  familles + types de prestation.
- L'absence de type de prestation (inclus/sur demande/réservable/
  commandable/supplément/horaires limités/indisponible) — n'existe nulle
  part aujourd'hui, ni sur `paid_services` ni sur `institutions.services`.
- L'absence de photo/horaires/localisation par prestation.
- L'absence totale de tout système de demande suivie (statut
  envoyée/reçue/en traitement/terminée) — n'existe dans aucune table du
  projet pour ce cas d'usage (à ne pas confondre avec `activite_demandes`,
  qui est un tout autre système : demandes d'ajout de taxonomie par une
  institution, revues par l'admin Yelen — rien à voir avec les demandes
  d'un client d'hôtel).

---

## F. Nouveau modèle de données — deux options, à trancher (rien créé)

### Tension à signaler explicitement avant de choisir

`docs/product/YELEN_TAXONOMIE_ACTIVITES_SPEC.md` §8 (**validé par le
CEO le jour même**, 20/08/2026) tranche déjà : *"Services — réutilisent
le mécanisme déjà existant — aucune nouvelle structure de données"*
(`institutions.services` + `paid_services`). Le présent brief demande
une structure sensiblement plus riche (type de prestation, horaires,
localisation, photo, prix optionnel, familles dynamiques). Ce n'est pas
forcément incompatible, mais **c'est une extension du périmètre validé
il y a quelques heures**, à signaler plutôt qu'à trancher silencieusement.

### Option 1 — Étendre `paid_services` (colonnes nullables, additif)

```
ALTER TABLE paid_services ADD COLUMN type_prestation text NULL
  CHECK (type_prestation IN ('inclus','sur_demande','reservable','commandable','supplement','horaires_limites','indisponible'));
ALTER TABLE paid_services ADD COLUMN unite_prix text NULL;      -- "par nuit", "par personne", "forfait"...
ALTER TABLE paid_services ADD COLUMN horaires text NULL;        -- texte libre, comme le reste du projet
ALTER TABLE paid_services ADD COLUMN localisation text NULL;    -- "Rez-de-chaussée", texte libre
ALTER TABLE paid_services ADD COLUMN photo_url text NULL;
```
`categorie` (déjà existante, texte libre) devient la "famille" — zéro
nouvelle table, l'affichage ne montre que les familles réellement
utilisées (un simple regroupement par valeur distincte). Conforme à
l'esprit §8 de la spec Taxonomie (aucune nouvelle structure).

**Mais** : `prix` est aujourd'hui `NOT NULL`/`> 0` obligatoire à
l'écriture (`route.ts:63,98`) — pour représenter une prestation
"incluse" (gratuite) ou "sur demande" (sans tarif), il faut soit
assouplir cette validation (uniquement quand `type_prestation` le
justifie — changement qui touche la route consommée par **tous les
secteurs**, donc à isoler avec précaution), soit garder les prestations
gratuites dans `institutions.services` (Option 2).

### Option 2 — Garder 3 niveaux séparés

- `institutions.services` (déjà "Chambres"/inclus, livré aujourd'hui) —
  inchangé.
- `paid_services` étendu (mêmes colonnes qu'Option 1) — uniquement pour
  les prestations **avec un prix réel** (réservable/commandable/
  supplément).
- Aucune modification de la validation `prix > 0` existante — zéro
  risque de régression sur les 14 autres secteurs qui utilisent déjà
  `paid_services` tel quel.

Inconvénient : les prestations "incluses" et "sur demande sans tarif"
restent dans un catalogue sans champs horaires/photo/localisation
(`OffreService` est plus pauvre), sauf à étendre aussi
`institutions.services` — mais c'est un jsonb sur une seule colonne,
moins simple à faire évoluer proprement qu'une table dédiée.

**Recommandation (à valider, pas décidée ici)** : Option 2 — préserve
le travail déjà livré aujourd'hui (Chambres = Offre générale), touche
une route partagée par tous les secteurs le moins possible, et respecte
le plus fidèlement l'esprit "additif, zéro régression" déjà appliqué
sur ce chantier hôtel depuis le début.

### Table demandes (nécessaire dans les deux options, si le §8/§9 du brief est scopé maintenant — voir risque bloquant §I)

```
CREATE TABLE hotel_prestation_demandes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  citoyen_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  prestation_id uuid REFERENCES paid_services(id),  -- nullable : une demande peut être libre ("signaler un problème")
  type_demande text NOT NULL,   -- texte libre ou petit enum, à trancher
  message text,
  statut text NOT NULL DEFAULT 'envoyee'
    CHECK (statut IN ('envoyee','recue','en_traitement','terminee','precision_requise')),
  cree_le timestamptz NOT NULL DEFAULT now(),
  mis_a_jour_le timestamptz
);
```
Transitions de statut **en code** (pattern `SIGNALEMENT_TRANSITIONS`),
jamais en trigger DB. RLS activé, policy `auth.uid() = citoyen_id` pour
la lecture citoyen (comme `avis`/`rdv`), écriture institution via
service_role (comme le reste du dashboard).

---

## G. Parcours utilisateur proposé

**Dashboard hôtelier** : nouvel onglet dédié (pas une extension de
"Services"), listant les prestations par famille (regroupement dérivé
de `categorie`, pas une liste figée), formulaire par prestation avec
type/prix optionnel/horaires/localisation/photo, + un sous-onglet
"Demandes" (liste des demandes clients avec changement de statut,
même esprit que `SignalementsTab.tsx`).

**Fiche publique (avant réservation)** : "Chambres" reste le point
d'entrée réservation (déjà livré). Ajout d'un bloc additif "Expérience
& Services" listant uniquement les familles réellement configurées,
badge par type de prestation, action contextuelle par item
(Réserver/Commander/Demander/Voir infos — jamais "Acheter" par défaut).

**Espace "pendant le séjour" (demandes suivies)** : ⚠️ voir blocage
explicite §I — dépend d'une notion de "citoyen actuellement en séjour"
qui n'existe pas dans le modèle de données actuel.

---

## H. Architecture de l'écran Hôtel V2

```
Dashboard institution (page.tsx)
  gating identique à ConfigurationHotelTab :
  activite_principale_code === "hotellerie"
        ↓
Nouveau composant séparé ServicesHotelTab.tsx
  (PAS un branchement dans ServicesTab.tsx — celui-ci reste
  strictement inchangé pour les 14 autres catégories)
        ↓
  Sous-onglet "Prestations" (CRUD par famille/type)
  Sous-onglet "Demandes" (patron SignalementsTab.tsx)

Fiche publique (InstitutionPublicClient.tsx)
  bloc additif "Expérience & Services", conditionnel isHotel,
  positionné après "Chambres" — même discipline que le bloc
  "Équipements & règles" déjà livré (Partie 12 de l'audit Hôtel Model)
```

---

## I. Risques de régression — dont un point bloquant

- **ServicesTab.tsx** : en créant un composant séparé plutôt qu'en le
  modifiant, le risque de régression sur les 14 autres secteurs devient
  quasi nul — c'est la principale raison de recommander cette scission.
- **InstitutionPublicClient.tsx** : fichier P0-durci, doit rester
  additif (bloc conditionnel, pas d'extraction de composant), comme
  déjà pratiqué pour "Chambres"/"Équipements & règles".
- **Validation `paid_services.prix > 0`** partagée par tous les
  secteurs — toute modification doit être strictement conditionnelle à
  `type_prestation`, jamais un assouplissement global (voir Option 1
  vs 2, §F).
- **⚠️ Point bloquant réel, à trancher avant tout code sur les
  sections 8/9 du brief (demandes de ménage, room service "pendant le
  séjour")** : le modèle actuel `rdv`/`paid_bookings` **n'a aucune
  plage de dates** (arrivée/départ) — confirmé par
  `docs/ui/YELEN_HOTEL_MODEL_AUDIT.md` Partie 7, qui recommandait
  explicitement de **ne pas construire de réservation par dates en V1**.
  Sans cette donnée, Yelen ne peut pas déterminer qu'un citoyen est
  *actuellement* client d'un hôtel donné pour lui ouvrir un espace
  "demandes de séjour" légitime — soit n'importe quel citoyen pourrait
  envoyer une "demande" à n'importe quel hôtel sans lien avec un séjour
  réel, soit ce sous-chantier dépend d'abord du chantier "vraie
  réservation par dates" explicitement mis en attente le 18/08/2026.

---

## J. Plan de migration (proposé, aucune migration créée)

1. Colonnes additives nullables sur `paid_services` (Option 1 ou 2,
   §F) — zéro impact secteurs non-hôtel.
2. `hotel_prestation_demandes` — nouvelle table, RLS dès la création.
3. `ServicesHotelTab.tsx` (dashboard) + gating `page.tsx` (même pattern
   que `ConfigurationHotelTab`).
4. Bloc additif fiche publique.
5. **Bloqué** tant que non tranché : détermination "en séjour" (§I) —
   nécessaire uniquement si les demandes suivies sont scopées dans
   cette V2 (voir décisions à trancher ci-dessous).

## K. Plan de tests

- Compte non-hôtel : `ServicesTab.tsx` strictement identique à
  aujourd'hui (aucune régression visuelle ni fonctionnelle).
- Hôtel sans aucune prestation configurée : écran propre, aucune
  famille vide affichée (exigence explicite §3/§11 du brief).
- `paid_services` créés avant la migration (tous secteurs confondus) :
  fonctionnent sans `type_prestation` renseigné, `prix` reste
  obligatoire pour eux comme aujourd'hui.
- RLS sur `hotel_prestation_demandes` : institution ne voit que ses
  demandes, citoyen ne voit que les siennes.
- `tsc --noEmit` + `npm run build` avant toute livraison (protocole
  standard du projet).

## L. Stratégie de compatibilité avec les autres profils

Composant séparé + gating au même point d'entrée unique déjà en place
(`activite_principale_code === "hotellerie"`) = garantie structurelle
qu'aucun autre secteur n'est affecté, à condition de ne jamais
brancher cette logique à l'intérieur de `ServicesTab.tsx` lui-même.

---

## Décisions à trancher avant tout code

1. **Option 1 (fusionner dans `paid_services` étendu, prix optionnel)
   vs Option 2 (garder 3 niveaux séparés, `paid_services` inchangé
   pour les autres secteurs)** — §F. Recommandation : Option 2.
2. **Familles dynamiques** : simple regroupement par `categorie` texte
   libre existante (zéro nouvelle table, conforme à la spec Taxonomie
   validée le jour même) vs vraie table de familles hôtelières dédiée.
3. **Demandes suivies (§8/§9 du brief)** : inclure maintenant malgré la
   dépendance non résolue "citoyen en séjour" (§I), ou scoper cette V2
   au catalogue + affichage + contact uniquement, et traiter les
   demandes-avec-statut comme chantier séparé une fois la réservation
   par dates construite ?
4. Où vit l'espace citoyen "suivre mes demandes" (nouvel écran sous
   `/compte/...` ou ailleurs) ?

**Aucun code, aucune migration, aucun commit n'a été effectué. Attente
de validation CEO sur les points ci-dessus avant toute implémentation.**
