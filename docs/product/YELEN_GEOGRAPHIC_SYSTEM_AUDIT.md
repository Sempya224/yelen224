# Audit — Yelen Geographic System (25/09/2026)

Audit READ-ONLY demandé avant tout code (brief CEO du jour). Aucun
fichier modifié, aucune migration créée, aucun commit. Chaque
affirmation est sourcée fichier:ligne, vérifiée par lecture directe
(pas de sous-agent — audit fait en direct, conformément à la règle
"pas d'Agent sans autorisation").

---

## 1. Constat confirmé : aucun référentiel géographique n'existe

Recherche exhaustive (`pays`, `country`, `VILLES_GUINEE`, migrations)
sur tout le repo. Résultat sans ambiguïté : **il n'existe aujourd'hui
ni table `countries`, ni table `cities`, ni aucune notion de pays
autre que du texte libre.**

### Ce qui existe réellement (Guinée uniquement)

| Fichier | Rôle | Nature |
|---|---|---|
| `lib/villes.ts` | `VILLES_GUINEE` — 33 préfectures + Conakry, `as const` | Tableau TS statique, aucune table DB |
| `lib/guineeRegionsGeo.ts` | Tracés SVG des 8 régions administratives (Centre d'Analyse) | Généré depuis geoBoundaries officiel, usage cartographie uniquement |
| `lib/villesCoordonnees.ts` | `VILLE_COORDONNEES` — lat/lng approximatives par préfecture | Usage strict : centrage par défaut de `LocationPicker.tsx`, jamais écrit dans `institutions.latitude/longitude` |

`VILLES_GUINEE` est consommé à 3 endroits concrets :
- `app/institution/inscription/engine/steps/ActiviteStep.tsx:575` — `<select>` "Sélectionner une ville" au moment de l'inscription institution, écrit dans `institutions.ville` (colonne texte libre, non contrainte en base).
- `app/recherche/RechercheInner.tsx:1114,1524` — filtre "Ville" de la recherche citoyenne (`ilike` sur `institutions.ville`) + détection de ville dans la requête tapée (`parseLocalisationRequete`).
- `app/compte/informations-personnelles/informations-client.tsx`, `app/profil/profil-client.tsx`, `app/inscription/page.tsx` — mêmes usages côté profil citoyen.

**Aucune de ces consommations ne passe par un id — toujours une chaîne de caractères comparée par `ilike`/égalité stricte.**

### `pays` — confirmé texte libre, jamais un référentiel

- `institutions.pays` (mentionnée dans `CLAUDE.md`) : colonne pré-existante (aucun `CREATE TABLE`/`ALTER` tracé dans les migrations, comme le reste des tables historiques), **aucun `<select>` ne la pilote dans le code actuel** — recherche exhaustive sans résultat d'un composant qui l'écrit.
- `institution_identite_internationale.pays_origine` (chantier Taxonomie des activités, 20/08/2026, `app/api/institution/identite-internationale/route.ts:61-62,84`) : **texte libre obligatoire**, aucune validation contre une liste de pays — le seul contrôle est "non vide". C'est le point le plus proche d'un besoin "pays" dans le produit aujourd'hui, et il est actuellement non structuré.
- `app/ambassades/page.tsx` : page éditoriale statique, ne consomme aucun référentiel pays dynamique.

**Conclusion : ta description est exacte à 100%. Il n'y a aujourd'hui que les villes/régions de Guinée (statiques, non liées entre elles par un id), et un seul champ "pays" texte libre sans aucune validation.**

---

## 2. Où ça bloque concrètement (chantier Hôtel)

D'après `docs/ui/YELEN_HOTEL_MODEL_AUDIT.md`/`YELEN_HOTEL_SERVICES_V2_AUDIT.md` (chantiers Hôtel V1/V2, clos et en cours) et la migration du jour (`20260925000001_reservation_chambre_hotel.sql`, vraie réservation par plage de dates) : **le vertical Hôtel est scopé Guinée de bout en bout**, aucune des deux audits ne mentionne pays/ville comme dimension de recherche — la recherche par établissement reste `institutions.ville` texte libre partagé avec les 14 autres secteurs. C'est cette limite précise qui motive ta demande.

---

## 3. Schéma proposé (à valider, rien créé)

Reprend ton brief, ajusté aux contraintes réelles du code trouvées ci-dessus.

```sql
-- Référentiel mondial complet, mais désactivé par défaut.
CREATE TABLE countries (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  iso2          char(2) NOT NULL UNIQUE,   -- "GN", "US", "FR"...
  iso3          char(3) NOT NULL UNIQUE,   -- "GIN", "USA", "FRA"...
  name          text NOT NULL,             -- nom anglais/international
  name_fr       text NOT NULL,             -- nom français affiché
  region        text,                      -- regroupement type M49 ("Africa", "North America"...)
  enabled       boolean NOT NULL DEFAULT false,  -- disponible commercialement sur Yelen
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Villes internationales uniquement (Guinée reste dans lib/villes.ts,
-- voir §4 — ne pas dupliquer une source de vérité qui marche déjà).
CREATE TABLE cities (
  id            uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_id    uuid NOT NULL REFERENCES countries(id) ON DELETE CASCADE,
  name          text NOT NULL,
  admin_area    text,             -- région/état si utile ("New York State")
  lat           numeric,
  lng           numeric,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (country_id, name)
);
```

RLS : lecture publique (`anon`/`authenticated`), écriture `service_role`
uniquement — même convention que toute table de référence Yelen (pas de
raison qu'un citoyen ou une institution écrive dans ce référentiel).

---

## 4. Stratégie de migration — point de désaccord potentiel avec ton brief à trancher

Ton brief propose de faire cohabiter `VILLES_GUINEE` (inchangé) avec un
nouveau système `countries`/`cities` pour l'international. **Sur ce
point précis, je recommande d'aller plus loin que "ne pas toucher" :
ne pas dupliquer la Guinée dans `cities` non plus**, pour une raison
concrète trouvée dans l'audit : `lib/villesCoordonnees.ts` et
`lib/guineeRegionsGeo.ts` sont **couplés** à `VILLES_GUINEE` (le
premier importe littéralement `VilleGuinee` comme type). Créer une
Guinée parallèle dans `cities` créerait deux sources de vérité pour la
même donnée (33 villes) avec un risque réel de divergence silencieuse
(ex. recherche filtrée sur une ville qui n'existe que dans une des deux
sources).

**Option recommandée** : `countries` référence la Guinée (`iso2='GN'`,
`enabled=true`) mais **aucune ligne `cities` pour la Guinée** — le
sélecteur Guinée continue d'utiliser `VILLES_GUINEE` tel quel (aucune
régression sur recherche/inscription/hôtel), et une fonction
`villesParPays(countryId)` fait la jonction : si `iso2==='GN'`, retourne
`VILLES_GUINEE` ; sinon, requête `cities` filtrée par `country_id`. Le
composant `<select>` Pays→Ville ne voit jamais la différence.

**Conséquence** : `institutions.ville`/`institutions.pays` restent des
colonnes texte, **aucune migration sur `institutions` n'est nécessaire**
pour ce chantier — la nouvelle table `countries`/`cities` est un
référentiel de saisie (peuple les `<select>`), pas encore un lien FK
depuis `institutions`. Lier `institutions.country_id`/`city_id` en FK
réelle serait une 2e étape, hors périmètre si le besoin immédiat est
seulement le wizard Hôtel (pays → ville → établissements).

---

## 5. Ce qui reste hors de ma portée sans decision explicite

- **Peuplement du référentiel pays complet** (~195 pays, codes ISO) :
  je peux l'écrire à la main depuis la norme ISO 3166-1 (donnée
  publique stable, pas une invention), mais c'est un fichier de
  seed SQL de plusieurs centaines de lignes — à confirmer que c'est
  bien voulu dès ce chantier plutôt qu'un sous-ensemble (CEDEAO +
  quelques pays prioritaires, cohérent avec `lib/geoAccess.ts` qui a
  déjà une liste CEDEAO pour le géoblocage, potentiellement
  réutilisable comme point de départ).
- **Villes internationales** : aucune source de données n'existe dans
  le projet (pas d'intégration GeoNames, pas de clé API). Le brief
  suggère GeoNames mais Yelen n'a aujourd'hui aucun mécanisme d'appel à
  une API externe pour peupler une table de référence — à trancher :
  saisie manuelle au fil de l'eau (comme `VILLES_GUINEE` l'a été à
  l'origine) vs. import ponctuel d'un extrait GeoNames (nécessiterait
  que tu fournisses le fichier, je n'ai pas d'accès réseau sortant).

---

## 6. Décisions à trancher avant tout code

1. **Scope immédiat** : ce chantier sert-il uniquement le wizard Hôtel
   (pays → ville → établissements), ou doit-il aussi brancher
   `institutions.pays`/`institution_identite_internationale.pays_origine`
   dès maintenant (FK vers `countries`) ?
2. **Confirmer l'option §4** (Guinée reste pilotée par `lib/villes.ts`,
   `cities` ne contient que l'international) plutôt que dupliquer la
   Guinée dans la nouvelle table.
3. **Ampleur du seed pays** : liste ISO complète (~195, tous
   `enabled=false` sauf Guinée) dès maintenant, ou sous-ensemble
   prioritaire élargi au fil de l'eau ?
4. **Villes internationales** : saisie manuelle au fil de l'eau
   (aucune ville tant qu'aucun pays n'est activé commercialement) —
   confirme que c'est suffisant pour démarrer, aucun import externe.

Aucun code, aucune migration, aucun commit effectué. En attente de tes
décisions sur les points ci-dessus avant de proposer un plan
d'implémentation.
