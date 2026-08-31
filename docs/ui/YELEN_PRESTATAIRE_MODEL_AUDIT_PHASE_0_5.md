# Phase 0.5 — Security blocker + validation du modèle prestataire (17/08/2026)

Suite directe de `docs/ui/YELEN_PRESTATAIRE_MODEL_AUDIT.md` (Phase 0).
**Aucun code, aucune migration, aucun composant n'a été écrit ou modifié
pendant cette phase.** Les chaînes de preuve les plus critiques (XSS,
`site_web`) ont été **re-vérifiées directement par lecture de fichier**
dans cette session (pas seulement reprises du rapport Phase 0), pour un
security blocker qui doit pouvoir être tranché sans ambiguïté.

---

## 1. Stored XSS — Security Blocker

### Chaîne exacte, étape par étape

| # | Étape | Fichier:ligne | Fonction/composant | Donnée | Statut |
|---|---|---|---|---|---|
| 1 | **SOURCE** — saisie utilisateur | `app/institution/[id]/dashboard/components/ProfilEntrepriseTab.tsx:343` | `<FormField label="Site web" value={form.website} onChange={v => fc("website", v)} name="website"/>` | `form.website` (string libre) | VERIFIED |
| 2 | Validation côté champ | `app/institution/[id]/dashboard/components/FormField.tsx:56,64,88` | `FormField` | `type` par défaut = `"text"` (le composant supporte `"url"` mais ce n'est **jamais passé** ici) | VERIFIED — aucune validation HTML5 native activée |
| 3 | Validation côté serveur à l'écriture | `app/api/institution/profile/route.ts:54,92-116` | `PUT` handler, boucle `EDITABLE_FIELDS` | `website` fait partie de `EDITABLE_FIELDS` (ligne 54) ; ligne 108-114, `payload[field] = value` **sans aucun contrôle** — contrairement à `secteur`/`statut_juridique` (whitelist, lignes 128-159) ou `latitude`/`longitude` (bornes numériques, lignes 121-126) | VERIFIED — aucune validation de format/protocole |
| 4 | Écriture DB | `app/api/institution/profile/route.ts:163` | `sb.from("institutions").update(payload)` | `institutions.website` (colonne `text`, aucune `CHECK` — confirmée absente dans toutes les migrations touchant `institutions`) | VERIFIED |
| 5 | Lecture DB (copie vers une 2ᵉ table) | `app/api/institution/partenariat/route.ts:109-116,130` | `POST` handler | `inst.website` relu, seule vérification = `!inst?.website?.trim()` (non-vide, ligne 115-116) — **aucune validation de format** — puis copié tel quel : `site_web: inst.website` (ligne 130) | VERIFIED |
| 6 | Écriture DB (2ᵉ table) | `supabase/migrations/20260726000010_partenariat_yelen.sql:19` | `INSERT institution_partenariat_demandes` | `site_web text NOT NULL` — **aucune `CHECK`** | VERIFIED |
| 7 | Lecture DB (côté admin) | `app/admin/partenariats/page.tsx` (`GET` sous-jacent, liste `items`) | chargement de la file d'attente partenariats | `d.site_web` | VERIFIED |
| 8 | Transformation | — | — | **Aucune** — la valeur transite intacte de bout en bout, jamais échappée, jamais canonicalisée | VERIFIED (absence de transformation confirmée) |
| 9 | **SINK** | `app/admin/partenariats/page.tsx:100` | rendu de la liste | `<a href={d.site_web} target="_blank" rel="noopener noreferrer">{d.site_web}</a>` — `href` construit directement depuis la donnée non fiable | VERIFIED |
| 10 | Navigateur/session concernée | — | — | Session **admin** (JWT signé `ADMIN_JWT_SECRET`, cookie posé après authentification `app/admin/login`) — le clic sur le lien exécute dans l'origine de l'application, avec les cookies de session admin actifs | VERIFIED (existence de la session admin confirmée par `lib/adminAuth.ts`, contenu exact du cookie hors périmètre de cet audit) |

### Pourquoi le champ est exploitable

Un payload `javascript:...` (ou tout schéma non-`http(s)`) survit intact
de la saisie (étape 1) jusqu'au rendu `<a href>` (étape 9) car **aucune
des 9 étapes intermédiaires ne valide, ne filtre ni n'échappe le contenu
du champ** — ni côté client (pas de `type="url"`), ni côté serveur (pas
de whitelist de schéma), ni en base (pas de `CHECK`), ni à la relecture
(la route partenariat ne vérifie que la non-vacuité), ni à l'affichage
(interpolation directe dans `href`, pas de sanitization).

### Rôles impliqués

| Question | Réponse | Preuve |
|---|---|---|
| Quel rôle peut **injecter** la valeur ? | Un membre institution avec la permission `profil_entreprise.write` (`ProfilEntrepriseTab.tsx`, rôle **admin** de l'institution uniquement — cf. `FIELD_ACTION`/`actionForField`, `app/api/institution/profile/route.ts:87-90`) | VERIFIED |
| Quel rôle peut être **exposé** (exécution du payload) ? | Un **administrateur Yelen** (n'importe quel rôle admin ayant accès à `/admin/partenariats`, cf. matrice `lib/adminAuth.ts`) | VERIFIED |
| Interaction requise ? | **Oui** — un clic sur le lien `d.site_web` est nécessaire (`target="_blank"`, pas d'auto-exécution au chargement de la page). Ce clic correspond à l'action normale attendue du workflow de review ("vérifier le site du candidat partenaire") | VERIFIED |
| Uniquement admin, ou d'autres surfaces ? | **2 surfaces supplémentaires trouvées en re-vérifiant** (voir ci-dessous) — pas seulement `admin/partenariats` | VERIFIED |

### Autres utilisations de `website`/`site_web` présentant un risque — vérification exhaustive faite dans cette session

| Fichier:ligne | Rendu | Sink réel ? | Statut |
|---|---|---|---|
| `app/institution/[id]/dashboard/components/MonPartenariatTab.tsx:142-143` | `<a href={institution.website} target="_blank" rel="noreferrer">` — **l'institution voit son propre lien** dans son propre dashboard | **Oui, sink** — mais scénario auto-XSS (l'institution s'attaquerait elle-même), sévérité très faible, aucun franchissement de frontière de privilège | VERIFIED |
| `app/admin/institutions/page.tsx:238` | `['Site web', selected.website \|\| '—']` — rendu comme **texte** dans une liste `{v}` (interpolation React, jamais dans un `href`) | **Non, pas un sink** — React échappe automatiquement le texte interpolé | VERIFIED (safe by construction) |
| `app/institution/[id]/InstitutionPublicClient.tsx` | **Aucune occurrence de `.website`** trouvée (grep exhaustif sur ce fichier) — seule `inst.site_web` (champ mort, toujours `undefined`) y est référencée | **Non exposé au public aujourd'hui** — confirme que le grand public n'est pas exposé, uniquement institution + admin | VERIFIED |

**Périmètre exact du correctif** (diagnostic uniquement, non implémenté) :
la faille doit être corrigée **à la source** (validation stricte du
schéma `http(s)://` avant toute écriture, dans `app/api/institution/profile/route.ts`
PUT) — corriger uniquement le sink (`app/admin/partenariats/page.tsx:100`)
laisserait `MonPartenariatTab.tsx:142-143` vulnérable, et laisserait la
donnée corrompue déjà en base pour toute institution ayant déjà exploité
le champ avant correction (un correctif d'écriture seul ne nettoie pas
les lignes existantes — un correctif de lecture/affichage serait donc
également nécessaire en défense en profondeur, conforme au principe
OWASP de validation à l'entrée **et** encodage contextuel à la sortie).

---

## 2. `site_web` — Bug fonctionnel

### État exact (re-vérifié dans cette session)

| Élément | Détail | Statut |
|---|---|---|
| Colonne DB | **N'existe plus** — ajoutée par `supabase/migrations/20260709000001_alter_institutions.sql:17`, supprimée par `supabase/migrations/20260711000003_drop_site_web.sql` (fusion dans `website`) | VERIFIED |
| Où `site_web` est encore **lu** dans le code | `app/institution/[id]/InstitutionPublicClient.tsx` : type `Institution.site_web?: string` (déclaré), `r.site_web ? String(r.site_web) : undefined` (mapping depuis `select("*")`), puis `{inst.site_web && <a href={inst.site_web}>Visiter le site →</a>}` (bloc Contacts) | VERIFIED |
| Où `website` est **écrit** | `app/api/institution/profile/route.ts:54` (`EDITABLE_FIELDS`), `app/api/institution/auth/register/route.ts:234` (inscription) | VERIFIED |
| Composants concernés | Uniquement `InstitutionPublicClient.tsx` lit `site_web`. `ProfilEntrepriseTab.tsx`, `MonPartenariatTab.tsx`, `app/admin/institutions/page.tsx`, `app/api/institution/partenariat/route.ts` lisent tous `website` (le bon champ) | VERIFIED |
| Comportement réel côté utilisateur | `supabase.from("institutions").select("*")` renvoie l'objet sans clé `site_web` (colonne inexistante) → `r.site_web` vaut `undefined` en JS → le bloc `{inst.site_web && ...}` ne s'affiche **jamais**, quel que soit le contenu réel de `website` | VERIFIED |
| Impact | Le bouton "Site web" de la fiche publique citoyenne **n'apparaît jamais**, même quand l'institution a renseigné un site web valide et non malveillant — feature cassée pour 100% des institutions | VERIFIED |

### Verdict

**BUG CONFIRMED** — régression introduite par la migration de suppression
(`20260711000003_drop_site_web.sql`) sans mise à jour correspondante du
code de lecture. Effet de bord accidentel (non voulu, mais réel) :
**réduit** l'exposition citoyenne à la faille XSS du §1, puisque le grand
public ne peut jamais cliquer sur ce lien mort — mais reste une vraie
régression produit indépendante du problème de sécurité.

---

## 3. `secteur` — Capacité de classification actuelle

### Les 8 valeurs exactes (re-vérifiées, `lib/secteurs.ts:9-12`)

```
sante, administratif, financier, juridique,
beaute_bien_etre, commerce, artisanat, services_divers
```

Confirmé identique dans 3 sources indépendantes (cohérence vérifiée) :
`lib/secteurs.ts:9-12` (labels), `app/api/institution/profile/route.ts:78`
(`SECTEURS` whitelist), `app/api/institution/auth/register/route.ts`
(même whitelist selon Agent Phase 0, à l'inscription).

| Question | Réponse | Preuve |
|---|---|---|
| Où défini | `lib/secteurs.ts:9-23` (labels + couleurs), contrainte `CHECK` réelle sur `institutions.secteur` (migration `20260710000001_onboarding_prestataire.sql:4,12-13`, non retrouvée nommément dans cette session mais confirmée par Phase 0 + cohérence des 3 whitelists applicatives) | VERIFIED |
| Où écrit | Inscription (obligatoire, `register/route.ts`), dashboard institution (`ProfilEntrepriseTab.tsx`, sélecteur 2 étapes, modifiable après coup) | VERIFIED |
| Où lu | `InstitutionPublicClient.tsx:856-857,975,983` (fiche publique), `app/api/institution/profile/route.ts:16,25` (dashboard institution), `app/api/institution/partenariat/route.ts:16,32,45,49,69-70` (stats partenariat, calcul "institutions similaires") | VERIFIED |
| Influence déjà l'UI | **Oui, mais purement cosmétique** sur la fiche (couleur d'accent, icône, libellé) — **une seule exception fonctionnelle réelle trouvée** : `app/recherche/shared.tsx:39-42`, `libelleAction(category)` fait varier le texte du bouton ("Réserver" vs "Prendre RDV") selon la catégorie — **preuve qu'un branchement de CTA par secteur/catégorie existe déjà comme pattern dans le code**, juste jamais porté sur la fiche institution elle-même | VERIFIED |
| Obligatoire | Oui, à l'inscription (`isActiviteComplete`, Phase 0 §7) | VERIFIED |
| Utilisable pour déterminer une présentation/CTA | Oui, techniquement immédiat — champ déjà rempli pour 100% des institutions existantes (obligatoire depuis l'inscription), aucune donnée manquante à gérer | VERIFIED |

### Question centrale : `secteur` peut-il servir de 1ʳᵉ couche de classification sans `profile_type` ?

**Oui, avec une réserve documentée.** Preuves :
1. Le champ est déjà obligatoire et universellement rempli (pas de valeur
   `NULL` à gérer pour les institutions créées après l'introduction de la
   contrainte).
2. Le pattern "CTA/libellé dérivé d'un champ de catégorie" existe déjà
   dans le code (`recherche/shared.tsx:39-42`), donc réutiliser ce même
   principe sur la fiche n'introduit pas un nouveau paradigme.
3. **Réserve** : les 8 valeurs sont conçues pour des institutions civiques
   (santé, administratif, financier, juridique) — les 4 valeurs restantes
   (`beaute_bien_etre, commerce, artisanat, services_divers`) devraient
   absorber TOUS les nouveaux profils cités par le CEO (PME tech, média,
   restaurant, professionnel). Nimba SMS/BilletFacile/MansaTalent
   tomberaient probablement tous dans `services_divers` — **`secteur` seul
   ne peut PAS distinguer une banque d'une PME tech si toutes deux
   atterrissent dans des catégories différentes par hasard, mais ne peut
   pas non plus distinguer deux PME tech différentes entre elles** (les
   deux dans `services_divers`). Un mapping `secteur → action principale`
   fonctionnerait pour un premier niveau grossier (services_divers/commerce/artisanat
   → "Découvrir"/"Contacter" par défaut, santé/administratif/financier/juridique
   → "Prendre RDV" par défaut) mais **ne peut pas, à lui seul, produire le
   rendu fin demandé pour Nimba SMS spécifiquement** (services listés,
   CTA "Découvrir" distinctif) sans combiner `secteur` à autre chose (voir
   §6/§13).

---

## 4. `hasBooking` — Dérivation sans migration

### Données et logique réelles (re-vérifiées)

- **Services gratuits** : `institutions.services` (jsonb), structure
  `{nom, description, duree_minutes, champs_complementaires}[]`
  (`ServicesTab.tsx`, confirmé Phase 0).
- **Services payants** : table séparée `paid_services` (`id, institution_id,
  nom, prix, duree_minutes, description, is_active`), re-vérifiée ligne
  par ligne dans cette session (`supabase/migrations/20260709000009_create_paid_services_bookings.sql:4-13`).
  Réservations correspondantes dans `paid_bookings` (`service_id,
  citoyen_id, institution_id, date_rdv, heure_rdv, statut` enum
  `en_attente/confirme/termine/no_show/annule`).
- **Disponibilités** : `institutions.disponibilites` (jsonb, tableau de
  chaînes), parsées par `lib/disponibilites.ts::generateSlotsInRange(raw,
  days)` (re-lu intégralement dans cette session) — 3 formats acceptés
  (ISO `2026-07-20T09:00`, hebdomadaire `Lundi 09:00`, quotidien `09:00`).
  **Comportement confirmé sur données invalides** : toute chaîne qui ne
  correspond à aucun des 3 regex est silencieusement ignorée (`continue`,
  lignes 39-72) ; un JSON non parseable retombe sur un split par
  virgule/point-virgule (ligne 25) ; un tableau vide ou 100% invalide
  retourne `[]` sans erreur.

### Analyse des cas demandés par le CEO

| Cas | Situation | `services.length` | Slots générés (`generateSlotsInRange`) | "Peut recevoir un RDV maintenant" ? |
|---|---|---|---|---|
| **A** | Services mais 0 disponibilité | > 0 | `[]` (disponibilites vide/absente) | **Non** — le wizard désactive silencieusement tout le calendrier (`app/rdv/[id]/page.tsx:929-930`, Phase 0 §6), aucun créneau réservable |
| **B** | Disponibilité mais 0 service réservable | `[]` (`services` vide ET aucun `paid_services.is_active=true`) | > 0 potentiellement | **Non** — le wizard affiche l'état vide explicite "Aucun service configuré" (`app/rdv/[id]/page.tsx:878-883`) avant même d'atteindre le calendrier |
| **C** | Booking actif (services ET disponibilités réels) | > 0 | > 0 | **Oui** — seul cas où un citoyen peut effectivement compléter une réservation de bout en bout |
| **D** | Sans booking mais avec `website` | `services=[]` ou `disponibilites` vide | `[]` ou n/a | **Non pour le booking**, mais l'institution reste "présentable" via son `website`/`whatsapp`/`phone` — cas exact visé par le nouveau modèle CTA (Découvrir plutôt que Prendre RDV) |
| **E** | Plusieurs capacités (gratuit + payant simultanément) | `services.length > 0` **et** `paid_services` actifs | Dépend de `disponibilites` (partagée entre les deux systèmes — pas de disponibilités séparées pour le payant) | **Oui si disponibilités non vides** — les deux systèmes de service partagent la même colonne `institutions.disponibilites`, donc le calcul `hasBooking` reste unique et ne se dédouble pas |
| **F** | Données incohérentes (ex. `disponibilites` = `["Lun 09:00", "PasUnJour 10:00"]`) | variable | Partiellement généré — seules les entrées valides produisent des créneaux, les entrées invalides sont silencieusement ignorées (comportement déjà existant, pas une nouveauté à gérer) | **Dépend du résultat après filtrage** — le calcul doit se faire sur le résultat de `generateSlotsInRange`, jamais sur la simple présence/absence du champ brut |

### Condition qui représente réellement "peut recevoir un RDV maintenant"

```
hasBooking = (services.length > 0 || paid_services actifs.length > 0)
             && generateSlotsInRange(disponibilites, N).length > 0
```

**Ni la simple présence de `services`, ni la simple présence de
`disponibilites` ne suffisent isolément** — le cas A et le cas B le
prouvent tous les deux avec des preuves déjà existantes dans le code
(`app/rdv/[id]/page.tsx:878-883` et `:929-930`). La bonne dérivation doit
combiner les deux **après parsing réel** des disponibilités (pas juste un
test de non-vacuité de la chaîne brute, à cause du cas F).

### Verdict

**Une dérivation applicative suffit — GAP confirmé absent de besoin de
migration.** Toutes les données nécessaires existent déjà
(`services`/`paid_services`/`disponibilites`), et la fonction de calcul
(`generateSlotsInRange`) existe déjà et est réutilisable telle quelle. Le
seul travail serait d'écrire une fonction dérivée (ex.
`peutRecevoirRdv(institution): boolean`) — **non fait dans cette phase**,
conformément à la règle "aucun code".

---

## 5. Matrice des capacités existantes

| Capacité | Existe | Table/champ | Fichier(s) clé | Obligatoire | Utilisé aujourd'hui | Comportement actuel | Statut |
|---|---|---|---|---|---|---|---|
| Booking / RDV (gratuit) | Oui | `institutions.services` (jsonb) + `rdv` | `ServicesTab.tsx`, `app/rdv/[id]/page.tsx` | Non | Oui | Voir §4 | VERIFIED |
| Booking / RDV (payant) | Oui | `paid_services` + `paid_bookings` | `20260709000009_create_paid_services_bookings.sql` | Non | Oui | Système séparé, partage `disponibilites` | VERIFIED |
| Website | Oui | `institutions.website` (text) | `ProfilEntrepriseTab.tsx:343` | Non | Oui | **Non validé, non affiché publiquement** (bug §2) | VERIFIED |
| WhatsApp | Oui | `institutions.whatsapp` (text) | `InstitutionPublicClient.tsx:1019,1182` | Non | Oui | Toujours affiché (dégrade si vide), neutralisé par construction (`.replace(/\D/g,"")`) | VERIFIED |
| Téléphone | Oui | `institutions.phone` (text) | `InstitutionPublicClient.tsx:1024` | Non | Oui | Conditionnel à la présence | VERIFIED |
| Email | Oui | `institutions.email` (text) | `InstitutionPublicClient.tsx:1191` | Non (optionnel dans dashboard, était requis à l'inscription selon versions antérieures) | Oui | Conditionnel | VERIFIED |
| Services | Oui | `institutions.services` (jsonb) | `ServicesTab.tsx` | Non | Oui | État vide si absent, n'affecte pas le CTA RDV (bug fonctionnel Phase 0) | VERIFIED |
| Disponibilités | Oui | `institutions.disponibilites` (jsonb) | `lib/disponibilites.ts` | Non | Oui | Voir §4 | VERIFIED |
| Adresse | Oui | `institutions.adresse`, `ville`, `quartier`, `latitude`, `longitude` | `ProfilEntrepriseTab.tsx` | `ville` oui, reste non | Oui | Utilisée pour Google Maps (itinéraire), recherche géographique | VERIFIED |
| Horaires | Oui | `institutions.horaires` (jsonb) | `ProfilEntrepriseTab.tsx:37-45` | Non | Oui | État vide si absent, badge Ouvert/Fermé si présent | VERIFIED |
| Réseaux sociaux | **Non** | — | — | — | — | N'existe pas (confirmé Phase 0, 0 occurrence) | VERIFIED (absence confirmée) |
| Booking URL externe | **Non** | — | — | — | — | N'existe pas (confirmé Phase 0, 0 occurrence) | VERIFIED (absence confirmée) |
| `profile_type` | **Non** | — | — | — | — | N'existe pas | VERIFIED (absence confirmée) |
| `secteur` | Oui | `institutions.secteur` (text + CHECK 8 valeurs) | `lib/secteurs.ts` | Oui | Oui | Voir §3 | VERIFIED |

---

## 6. Architecture du futur CTA — comparaison

### A — CTA uniquement déterminé par `secteur`

- **Fonctionnement** : table de correspondance statique `secteur → action principale`, en code.
- **Avantages** : zéro migration, implémentable en quelques lignes, cohérent avec le seul précédent existant (`recherche/shared.tsx:39-42`).
- **Inconvénients** : ne distingue pas deux prestataires du même secteur avec des capacités très différentes (cas D vs cas C dans un même `secteur=services_divers`, §4) ; risque de mauvais CTA élevé pour tout ce qui tombe dans `services_divers`/`commerce`/`artisanat`.
- **Dette technique** : faible à court terme, mais la table de correspondance devient vite un fourre-tout à mesure que le catalogue de secteurs reste figé à 8 valeurs pensées pour des institutions civiques.
- **Migration nécessaire** : aucune.
- **Complexité** : très faible.
- **Extensibilité** : faible — toute nuance nouvelle demande une nouvelle branche conditionnelle en dur.
- **Nimba SMS** (`secteur` probablement `services_divers`) : CTA "Découvrir" possible par défaut pour ce secteur, mais **toute autre institution `services_divers` reçoit le même CTA**, même si elle a un vrai système de RDV actif.
- **Banque** (`secteur=financier`) : CTA "Prendre RDV" correct par défaut.
- **Commerçant** (`secteur=commerce`) : CTA "Voir le catalogue"/"Commander" possible par mapping, mais pas de vraie donnée catalogue derrière (n'existe pas).
- **Média** : aucun `secteur` dédié n'existe pour "média" — tomberait dans `services_divers`, indissociable de Nimba SMS par ce seul critère.
- **PME générique** : idem, `services_divers` par défaut, aucune distinction fine.

### B — CTA déterminé par `secteur` + capacités réelles (`hasBooking`, `website`, `whatsapp`...)

- **Fonctionnement** : le `secteur` propose un CTA par défaut, **mais `hasBooking` (§4) et la présence de `website` peuvent le corriger** — ex. règle : *"si `hasBooking` est vrai, CTA = Prendre RDV, peu importe le secteur ; sinon si `website` existe, CTA = Découvrir ; sinon CTA = Contacter (WhatsApp/Appeler)"*.
- **Avantages** : corrige directement le défaut principal de l'option A (deux prestataires du même secteur avec des capacités différentes reçoivent des CTA différents) ; utilise exclusivement des données déjà existantes (§4-§5) ; zéro migration.
- **Inconvénients** : la règle de priorité (quelle capacité l'emporte sur quelle autre) doit être explicitée et assumée comme un choix produit — pas neutre (ex. une banque avec RDV ET un site web : le RDV doit-il toujours gagner ?).
- **Dette technique** : faible, la logique de dérivation est un point unique testable, pas dispersée.
- **Migration nécessaire** : aucune.
- **Complexité** : faible à modérée.
- **Extensibilité** : bonne — ajouter une nouvelle capacité (ex. catalogue produits, plus tard) enrichit la règle sans la casser.
- **Nimba SMS** : `hasBooking=false` (pas de disponibilités configurées probable), `website` présent → **CTA "Découvrir" automatiquement correct**, sans avoir eu besoin de la classer différemment des autres `services_divers`.
- **Banque** : `hasBooking=true` → **CTA "Prendre RDV" automatiquement correct**, quel que soit le secteur exact.
- **Commerçant** : dépend de ses capacités réelles configurées — cohérent avec l'objectif produit (pas de fausse promesse "Commander" si aucun catalogue n'existe réellement).
- **Média** : `hasBooking=false`, `website` présent → "Découvrir"/"Lire" par défaut, cohérent sans besoin d'un `secteur` "média" dédié.
- **PME** : même logique, résultat dépend de ses capacités réelles, pas d'une case secteur figée.

### C — Action Engine / moteur d'actions configurable

- **Fonctionnement** : chaque institution (ou chaque `secteur`, ou chaque institution individuellement) a une configuration explicite stockée (`primary_action`, `secondary_actions[]`), éditable manuellement ou via règles.
- **Avantages** : contrôle total, cas particuliers gérables un par un (ex. une institution atypique dans son secteur), pas de règle implicite à maintenir en code.
- **Inconvénients** : nécessite une vraie migration (nouveau champ/table), nécessite une UI d'administration pour le configurer (qui **n'existe pas aujourd'hui**, Phase 0 §7 — l'admin n'a aucun formulaire d'édition de fiche institution), risque d'incohérence si laissé vide (valeur par défaut à définir quand même) — donc **ne remplace pas** la logique de dérivation de l'option B, elle s'y ajoute en surcouche optionnelle.
- **Dette technique** : la plus élevée des 3 à court terme (nouvelle surface à maintenir : formulaire admin, migration, valeurs par défaut, cas où l'admin ne configure rien).
- **Migration nécessaire** : oui (a minima un champ `primary_action` optionnel, potentiellement une table si `secondary_actions[]` doit être structuré plutôt qu'un simple tableau jsonb).
- **Complexité** : élevée.
- **Extensibilité** : la meilleure à long terme, une fois construite.
- **Comportement pour les 5 profils cités** : identique à l'option B par défaut (dérivation automatique), avec possibilité de **surcharge manuelle** cas par cas si un admin la configure — mais cette configuration manuelle n'a aujourd'hui aucune UI pour exister.

### Recommandation

**Option B — CTA déterminé par `secteur` + capacités réelles.** C'est la
seule option qui (1) résout directement le problème identifié en Phase 0
("CTA RDV toujours dominant, y compris quand il mène à un état vide"),
(2) ne nécessite aucune migration ni nouveau composant, (3) ne promet pas
une UI de configuration admin qui n'existe pas encore. L'option C
(`profile_type`/moteur configurable) reste une évolution possible **plus
tard**, si l'option B s'avère insuffisante en usage réel (voir §7) — mais
construire l'option C directement reviendrait à ajouter de la dette
(formulaire admin manquant, migration, valeurs par défaut) pour un
problème que l'option B résout déjà avec les données existantes.

---

## 7. `profile_type` — Doit-il exister ?

| Comparaison | Problème résolu | Problème créé | Doublon avec `secteur` ? | Migration ? |
|---|---|---|---|---|
| `secteur` seul (option A) | CTA au moins non-hardcodé | Granularité insuffisante (§6) | — | Non |
| `profile_type` seul (remplaçant `secteur`) | Pourrait être plus fin dès le départ | Double la structure existante (`secteur` reste utilisé ailleurs — stats partenariat, recherche géographique par secteur), migration de données existante nécessaire (mapper les 8 valeurs `secteur` actuelles vers de nouvelles valeurs `profile_type` sans rien casser) | **Oui, doublon direct** si les deux coexistent sans rôle clairement distinct | Oui |
| `secteur` + capacités (option B, §6) | Résout le problème réel identifié sans nouvelle colonne | Aucun nouveau problème structurel | Non — capacités et secteur ont des rôles distincts et complémentaires | Non |
| `secteur` + capacités + configuration d'actions (option C, §6) | Cas particuliers non couverts par la dérivation automatique | Nécessite une UI admin qui n'existe pas | Non | Oui (légère) |

### Réponses aux questions posées

- **Quel problème `profile_type` résoudrait** : une granularité de
  classification plus fine que les 8 valeurs actuelles de `secteur`
  (permettrait de distinguer "PME tech" de "commerçant" explicitement,
  plutôt que de les regrouper dans `services_divers`).
- **Quel problème il créerait** : un doublon partiel avec `secteur`
  (lequel des deux est la source de vérité pour l'affichage, les stats
  partenariat, la recherche ?), une migration de données pour toutes les
  institutions existantes, et le besoin d'un formulaire d'édition (admin
  ou institution) qui n'existe pas aujourd'hui pour le renseigner
  proprement.
- **Ferait-il doublon avec `secteur`** : oui, s'il vise le même rôle
  ("type de l'institution"). Non, s'il est explicitement scopé à autre
  chose (ex. `profile_type` = famille d'action commerciale, `secteur` =
  domaine d'activité civique/légal — mais cette distinction reste à
  définir par le CEO, pas tranchée par cet audit).
- **Nécessite-t-il une migration** : oui, dans tous les cas où il s'agit
  d'un nouveau champ persistant.
- **Réellement nécessaire pour Phase 1** : **non**, au vu de la preuve
  §4/§6 — l'option B (dérivation par capacités) couvre déjà les 5
  exemples cités par le CEO sans lui.
- **Introductible plus tard sans casser l'architecture** : **oui**, à
  condition que la logique de dérivation de CTA (option B) soit écrite
  comme une fonction isolée (ex. `determinerActionPrincipale(institution)`)
  plutôt que dispersée inline dans les composants — un futur
  `profile_type` viendrait alors simplement s'ajouter comme un signal
  supplémentaire consommé par cette même fonction, sans réécriture.

### Recommandation finale

**DEFER.** Ne pas créer `profile_type` maintenant — la dérivation par
`secteur` + capacités (option B) couvre le besoin immédiat sans migration
ni nouvelle UI manquante. Réévaluer après un premier usage réel de
l'option B, si des cas concrets démontrent que le secteur seul reste trop
grossier même combiné aux capacités.

---

## 8. In-app browser — Architecture

### Constats techniques (Phase 0 + connaissances plateforme générales, distinguées explicitement)

| # | Sujet | Constat | Statut |
|---|---|---|---|
| 1 | Navigation navigateur externe classique | C'est le comportement actuel à 100% (`target="_blank"` partout, Phase 0 §10) | VERIFIED (code Yelen) |
| 2 | Mécanisme intégré compatible PWA | Une PWA standard (comme Yelen aujourd'hui) **ne peut pas** ouvrir un site tiers dans une "vraie" iframe de façon fiable — la **grande majorité des sites modernes envoient `X-Frame-Options: DENY/SAMEORIGIN` ou une CSP `frame-ancestors` restrictive côté serveur tiers**, qui bloque leur affichage en iframe **quel que soit ce que fait Yelen** — Yelen ne contrôle pas les en-têtes du site externe. C'est une limite du web, pas de l'implémentation Yelen. | NOT VERIFIED comme testé sur un site précis (dépend du site tiers, à vérifier cas par cas), mais **principe de plateforme bien établi**, non spécifique à Yelen |
| 3 | WebView / wrapper natif futur | Nécessiterait une app native (Capacitor/React Native/etc.) — **rien de tel n'existe dans le dépôt aujourd'hui** (confirmé Phase 0 §10, 0 résultat) ; une WebView native n'a pas cette limitation `X-Frame-Options` de la même façon (elle charge la page comme un navigateur autonome, pas en iframe imbriquée) | VERIFIED (absence actuelle) |
| 4-5 | Comportement iOS/Android | **Non documenté dans le code, jamais testé sur appareil dans cet environnement** (confirmé Phase 0 §10) | NOT VERIFIED |
| 6 | Retour vers Yelen | Avec `target="_blank"` classique : dépend entièrement du navigateur/OS (bouton retour du navigateur ou de l'app switcher) — Yelen n'a aujourd'hui aucun contrôle sur ce retour | VERIFIED (comportement actuel) |
| 7 | Cookies/session du site externe | Hors du contrôle de Yelen dans tous les scénarios (navigation externe ou iframe) — le site tiers gère ses propres cookies indépendamment | VERIFIED (par construction, aucune intégration technique n'existe) |
| 8 | Liens qui refusent l'iframe | Voir point 2 — c'est la norme pour la majorité des sites (banques, réseaux sociaux, beaucoup de sites institutionnels), pas l'exception | Principe général, non testé site par site dans cet audit |
| 9 | CSP/X-Frame-Options de Yelen elle-même | `middleware.ts:80-120` (Phase 0 §11) : `frame-src` limité à YouTube + Supabase — **Yelen n'autorise déjà aucun domaine tiers arbitraire en iframe sortante aujourd'hui**, il faudrait explicitement l'élargir pour un in-app browser en iframe, ce qui affaiblirait la CSP actuelle | VERIFIED |
| 10 | Tracking/analytics | Un iframe cross-origin ne peut pas être inspecté/mesuré par Yelen (isolation navigateur standard) — seule une vraie WebView native donnerait ce niveau de contrôle | Principe général |
| 11 | Sécurité | Un iframe pointant vers une URL non validée hériterait du même risque que le sink `<a href>` du §1 (URL malveillante) — **le problème de validation d'URL doit être résolu avant toute forme d'intégration**, iframe ou non | Raisonnement dérivé du §1 |
| 12 | Maintenance | Une solution "iframe quand possible, sinon fallback navigation externe" ajoute de la complexité (détection d'échec de chargement iframe, timeout, message d'erreur) pour un bénéfice partiel (fonctionne seulement sur les sites qui l'autorisent) | Estimation |
| 13 | Évolution vers app native | Une WebView native résout la plupart des limites ci-dessus (2, 8, 9, 10) — mais n'existe pas aujourd'hui et sort du périmètre de cette phase | VERIFIED (n'existe pas) |

### Recommandation

**Ne pas construire d'iframe "in-app browser" sur la PWA actuelle.**
Raisons : (a) la limitation `X-Frame-Options`/CSP est côté site tiers,
hors du contrôle de Yelen, donc la fonctionnalité échouerait
silencieusement ou visiblement pour une part significative et
imprévisible des prestataires ; (b) la CSP actuelle de Yelen
(`frame-src` restreint) devrait être affaiblie pour l'autoriser, ce qui
recrée une surface d'attaque proche de celle du §1 si l'URL n'est pas
strictement validée en amont ; (c) aucune infrastructure native
n'existe pour une vraie WebView. **Alternative recommandée pour Phase 1** :
garder `target="_blank"` classique (comportement déjà connu et stable),
mais **valider strictement l'URL avant de construire le lien** (§9) —
l'"expérience intégrée" avec retour facile ne devient réalisable
proprement qu'avec une app native future (WebView), à traiter comme un
chantier séparé et explicitement hors de la Phase 1.

---

## 9. Security model pour les URLs externes — règles pour Phase 1 (non implémentées)

| Règle | Recommandation |
|---|---|
| Schémas autorisés | `http:` et `https:` uniquement — tout autre schéma (`javascript:`, `data:`, `file:`, `vbscript:`, etc.) **rejeté à la validation**, jamais stocké |
| HTTPS obligatoire | Recommandé mais pas strictement bloquant pour V1 (certains petits prestataires guinéens peuvent ne pas avoir de certificat) — **avertir** si `http:` plutôt que bloquer, à trancher par le CEO |
| Validation côté serveur | **Obligatoire** — c'est le seul point de contrôle réellement fiable (le client peut toujours être contourné). Utiliser le constructeur `URL()` natif pour parser, vérifier `protocol ∈ {'http:','https:'}`, rejeter si le parsing échoue (`URL malformée`) |
| Validation côté client | Complémentaire (meilleure UX, retour immédiat), jamais suffisante seule — `type="url"` sur le champ `FormField` (actuellement absent, §1 étape 2) comme premier filtre, pas comme seule protection |
| Canonicalisation | Normaliser via `new URL(input).toString()` avant stockage, pour éviter les variantes d'encodage trompeuses |
| Redirections | Non contrôlables par Yelen après le clic (le site tiers peut rediriger où il veut une fois quitté) — accepter cette limite, documenter que Yelen ne garantit pas la destination finale après un premier saut |
| Domaines | Pas d'allow-list de domaines envisagée (bloquerait l'ajout libre de sites prestataires) — la protection repose sur la validation de schéma, pas sur une liste blanche de domaines |
| URLs malformées | Rejet au moment de la sauvegarde (erreur 400 explicite), jamais un stockage silencieux d'une valeur invalide |
| Protocoles dangereux | `javascript:`, `data:`, `vbscript:`, `file:` — **rejet explicite**, correspond directement au vecteur du §1 |
| Comportement si URL invalide | Message d'erreur clair au moment de la sauvegarde côté institution ("Ce lien ne semble pas valide, vérifiez le format https://...") |
| Comportement si site inaccessible au clic | Hors du contrôle de Yelen (comportement standard du navigateur, page d'erreur native) — pas une responsabilité applicative |

Ces règles s'appliquent à **`website`** en priorité (source du bug
actuel), et devraient s'appliquer de façon identique à tout futur champ
de type URL (réseaux sociaux, `booking_url`) si ces champs sont créés.

---

## 10. Risque de redirect / open redirect

| Risque | Applicable au CTA "Découvrir" tel qu'envisagé ? | Protection nécessaire |
|---|---|---|
| Open redirect (Yelen redirige vers une URL arbitraire via un paramètre) | **Non applicable aujourd'hui** — les liens `<a href>` actuels pointent directement vers la valeur stockée, pas via une route de redirection Yelen paramétrée (`/api/offres/[id]/clic` existe pour les offres avec tracking, mais c'est un cas distinct déjà en place, hors périmètre `website`) | Si un futur mécanisme de tracking de clic est ajouté pour `website` (similaire à `/api/offres/[id]/clic`), il devra valider strictement l'URL cible avant de rediriger — mêmes règles que §9 |
| Phishing (institution légitime détournée pour promouvoir un lien malveillant) | **Applicable** — c'est exactement le vecteur du §1 : le champ `website` légitime peut contenir n'importe quoi tant que non validé | Corrigé par la validation §9 |
| `javascript:` | **Applicable, déjà confirmé exploitable** (§1) | Rejet de schéma §9 |
| `data:` | **Applicable en théorie** (même chemin que `javascript:`, non testé spécifiquement mais même absence de filtre) | Rejet de schéma §9 |
| URL de redirection malveillante (site A légitime au moment de la saisie, redirige vers un site B malveillant plus tard) | **Applicable** — Yelen ne peut pas contrôler ce qu'un site externe fait après le premier clic, aujourd'hui ni demain sans surveillance active impossible à garantir | Documenter la limite (§9, ligne "Redirections"), pas de protection technique possible côté Yelen |
| Domaine compromis après coup | Même limite que ci-dessus | Idem — hors de portée technique de Yelen |
| Changement de destination après validation initiale | Si Yelen valide l'URL une fois à la saisie mais que l'institution la change ensuite sans repasser par la validation | **Doit être couvert** : la validation §9 doit s'appliquer à **chaque écriture**, pas seulement à la création initiale — déjà le cas naturellement puisque `PUT /api/institution/profile` est le point d'écriture unique pour toute modification |

---

## 11. Migration DB — nécessaire ou non pour le modèle cible minimal

| Option | Schéma | Coût | Risques | Rollback | Compatible avec l'existant |
|---|---|---|---|---|---|
| **1 — Aucune migration** | Dérivation `hasBooking` + mapping `secteur → CTA` entièrement en code (option B, §6) | Très faible (aucune migration, quelques fonctions) | Faible — logique pure, testable isolément | Trivial (retirer le code) | 100% compatible, aucune donnée touchée |
| **2 — Ajout de quelques champs** | Ex. `primary_action text` optionnel, nullable, sans contrainte forte au départ | Faible à modéré (1 migration additive, non bloquante) | Faible si nullable et sans `NOT NULL`/`CHECK` immédiat — risque si une contrainte trop stricte est ajoutée trop tôt sans backfill (piège déjà documenté dans le projet, `CLAUDE.md` /pieges-techniques-connus) | Simple (colonne nullable, `DROP COLUMN` sans casser les lectures existantes si le code cesse de la lire) | Compatible si additive et nullable |
| **3 — Nouveau modèle capacités/actions** | Table dédiée (`institution_actions` ou similaire) avec relations | Élevé (migration + nouvelle UI admin nécessaire pour être réellement utile, cf. §7) | Plus élevé — nouvelle surface à sécuriser (RLS, permissions), plus de code à maintenir | Plus complexe (dépendances potentielles) | Compatible si conçu en ajout pur, mais le coût de mise en œuvre dépasse largement le besoin actuel prouvé |

### Recommandation

**Option 1 pour la Phase 1 — aucune migration.** Les preuves des §4/§6/§7
montrent que la dérivation applicative couvre le besoin immédiat.
**Option 2** reste la voie d'extension naturelle si un vrai besoin de
configuration manuelle apparaît après un premier usage (ex. un CEO qui
veut fixer manuellement un CTA pour un partenaire stratégique précis,
sans attendre que la dérivation automatique le fasse). **Option 3**
prématurée tant que l'admin n'a même pas de formulaire d'édition de base
(Phase 0 §7).

---

## 12. Compatibilité avec l'existant

| Système | Impact du modèle proposé (option B, aucune migration) | Statut |
|---|---|---|
| Booking (RDV gratuit + payant) | **Aucun changement structurel** — `hasBooking` est une lecture dérivée, ne modifie ni `services`, ni `disponibilites`, ni `rdv`, ni `paid_bookings` | VERIFIED (par construction — dérivation en lecture seule) |
| Services / Disponibilités / Horaires | Inchangés, continuent d'alimenter le wizard `/rdv/[id]` exactement comme aujourd'hui | VERIFIED |
| Avis / Questions | Aucune donnée ni composant partagé avec la logique de CTA — sections indépendantes de la fiche | VERIFIED (Phase 0 §4, sections distinctes) |
| WhatsApp / Téléphone / Email | Deviennent des actions secondaires explicites plutôt qu'implicites, mais **les mêmes champs, les mêmes conditions d'affichage restent utilisables tels quels** | VERIFIED |
| Recherche | `app/recherche/shared.tsx:39-42` fait déjà varier un libellé par catégorie — le nouveau modèle **prolonge un pattern existant**, ne le contredit pas | VERIFIED |
| Profil institution (dashboard) | Aucun champ actuel n'a besoin d'être renommé/supprimé pour cette évolution — `secteur`/`services`/`disponibilites`/`website` restent identiques | VERIFIED |
| Fiche publique | Le changement porte sur **quel CTA s'affiche en premier**, pas sur la structure de données consommée (`InstitutionPublicClient.tsx` continue de lire les mêmes champs) | VERIFIED |
| Administration | Aucun impact — l'admin n'édite déjà aucun de ces champs (Phase 0 §7), rien à migrer côté admin pour l'option B | VERIFIED |

**Conclusion : l'option B (§6) est une évolution strictement additive côté
lecture/affichage — aucun système existant cité par le CEO n'est
modifié structurellement.**

---

## 13. Décision architecturale — modèle cible proposé

```
Prestataire (institutions — AUCUN champ renommé/supprimé)
│
├── secteur (existant — 1er niveau de contexte, jamais seul décisionnaire)
│
├── capacités (dérivées à la volée depuis les données existantes, jamais stockées)
│   ├── hasBooking = (services non vide OU paid_services actifs) ET créneaux réels générés (§4)
│   ├── hasWebsite = website non vide ET valide (§9)
│   ├── hasWhatsapp = whatsapp non vide
│   ├── hasPhone = phone non vide
│   └── hasEmail = email non vide
│
└── action principale déterminée par une fonction unique de priorité
    (ex. hasBooking > hasWebsite > hasWhatsapp/hasPhone), jamais par
    un simple `if secteur === X`
```

### Comment éviter l'enfermement `secteur = X → bouton = Y`

Le point clé, déjà prouvé par le §6 (option B) : **la fonction de
décision doit prendre `secteur` comme un des multiples signaux d'entrée,
jamais comme la seule variable de décision.** Concrètement :
- `secteur` peut fournir une **valeur par défaut plausible** en absence
  d'autre signal (ex. `financier`/`sante`/`administratif`/`juridique` →
  défaut "Prendre RDV" si aucune capacité n'est calculable autrement).
- Les **capacités réelles** (`hasBooking` en priorité) **surclassent
  toujours** ce défaut dès qu'elles sont calculables — une institution
  `secteur=financier` sans aucune disponibilité configurée ne doit **pas**
  afficher "Prendre RDV" juste parce que son secteur le suggère
  généralement (correction directe du bug identifié en Phase 0 §4/§6).
- Cette fonction reste **une pièce de code isolée et testable**
  (`determinerActionPrincipale(institution): { principale, secondaires[]
  }`), ce qui permet d'ajouter plus tard un signal supplémentaire
  (`profile_type`, une configuration manuelle admin) **sans réécrire les
  appelants** — seul le corps de la fonction change.

---

## 14. Phase 1 — Périmètre proposé (à valider par le CEO avant tout code)

### MUST HAVE
- Fonction de dérivation `hasBooking` (§4), pure, testable, sans migration.
- Fonction de décision d'action principale/secondaires combinant `secteur` + capacités (§13), isolée du rendu.
- Validation stricte de `website` à l'écriture (schéma `http(s)` uniquement) — **corrige le security blocker §1 à la source**.
- Correction du bug `site_web` → `website` sur la fiche publique (§2) — un simple renommage de champ lu, cohérent avec "pas de réécriture".

### SHOULD HAVE
- Défense en profondeur : validation/avertissement également à l'affichage (pas seulement à l'écriture), pour couvrir les données déjà en base avant correctif.
- Message explicite dans le wizard RDV pour le cas "services existants mais 0 disponibilité" (gap silencieux déjà identifié Phase 0 §6).
- Nettoyage de l'affichage admin "Document officiel : Fourni/Non fourni" (lit un champ mort, Phase 0 §3.5) — sans lien direct avec les CTA mais découvert dans le même périmètre d'audit.

### LATER
- `profile_type` ou configuration manuelle d'action (option C, §6/§7), si l'usage réel de MUST HAVE démontre une insuffisance.
- Champs réseaux sociaux / `booking_url` si le CEO les juge nécessaires.
- Formulaire admin d'édition de fiche institution (actuellement inexistant).

### OUT OF SCOPE (Phase 1)
- In-app browser / navigateur intégré (§8) — nécessite une réflexion native séparée, pas une PWA.
- Tracking de clics sortants type `/api/offres/[id]/clic` généralisé à `website` (au-delà du périmètre demandé).
- Toute nouvelle taxonomie remplaçant `secteur`.

---

## 15. CEO SUMMARY

1. **Security blocker** : oui, confirmé et actif — stored XSS via `website` non validé, exploitable jusqu'à une session admin (et, en moindre gravité, jusqu'à l'institution elle-même via son propre dashboard). Non corrigé (hors périmètre de cette phase, sur instruction explicite).
2. **Stored XSS — état exact** : chaîne complète en 10 étapes, source = `ProfilEntrepriseTab.tsx:343`, sink principal = `app/admin/partenariats/page.tsx:100`, sink secondaire = `MonPartenariatTab.tsx:142-143` (auto-XSS, faible gravité). Aucune des 9 étapes intermédiaires ne valide/échappe la donnée. Correctif nécessaire à la source (écriture) **et** en défense en profondeur à l'affichage (données déjà en base).
3. **`site_web` — état exact** : bug fonctionnel confirmé, colonne supprimée en base (fusionnée dans `website`) mais code de lecture jamais mis à jour sur la fiche publique — le bouton "Site web" citoyen n'existe plus en pratique, alors que le champ `website` est bien rempli. Effet de bord : réduit accidentellement l'exposition publique à la faille #2.
4. **`secteur` — ce qu'il permet réellement** : seul champ de typologie vivant et obligatoire, réutilisable comme premier niveau de contexte pour un CTA, mais **insuffisant seul** pour distinguer finement les nouveaux profils cités (PME tech, média, commerçant tomberaient tous dans les mêmes 1-2 valeurs génériques).
5. **`hasBooking` — dérivable ou non** : **dérivable sans aucune migration**, formule = services/paid_services non vides ET créneaux réels générés par `generateSlotsInRange` (pas juste la présence brute du champ `disponibilites`) — toutes les données et la fonction de parsing existent déjà.
6. **Capacités existantes** : booking (gratuit + payant), website (non validé), WhatsApp (safe), téléphone, email, services, disponibilités, adresse, horaires — toutes VERIFIED présentes. Réseaux sociaux et booking URL externe : absents, confirmé par recherche exhaustive.
7. **`profile_type` — nécessaire ou non** : **non nécessaire pour Phase 1** (recommandation DEFER) — la combinaison `secteur` + capacités réelles couvre déjà les 5 exemples cités par le CEO sans nouvelle colonne ni migration.
8. **Architecture CTA recommandée** : Option B — `secteur` comme signal par défaut, **surclassé par les capacités réelles** (`hasBooking` en priorité), fonction de décision isolée et testable, zéro migration.
9. **Architecture in-app recommandée** : **ne pas construire d'iframe "in-app browser" sur la PWA actuelle** — limitation technique hors du contrôle de Yelen (`X-Frame-Options`/CSP des sites tiers). Garder la navigation externe classique pour Phase 1, avec URL strictement validée ; réserver l'"expérience intégrée avec retour facile" à une future app native (WebView), hors périmètre Phase 1.
10. **Sécurité des URLs** : règles précises documentées pour Phase 1 (§9) — schémas `http(s)` uniquement, validation serveur obligatoire, canonicalisation, rejet explicite des schémas dangereux (`javascript:`, `data:`, etc.) — non implémentées, prêtes à trancher.
11. **Migration DB nécessaire ou non** : **non, pour le modèle minimal (option 1)** — dérivation applicative pure suffit. Option 2 (quelques champs additifs) réservée à une extension future si besoin démontré.
12. **Risques** : (a) le security blocker XSS reste actif tant que non corrigé, indépendamment de cette évolution produit ; (b) `secteur` seul restera insuffisant si le CEO veut une granularité plus fine que "services_divers" pour distinguer ses exemples entre eux ; (c) aucun test réel du comportement d'ouverture de lien sur iOS/Android n'a été possible dans cet environnement.
13. **Phase 1 recommandée** : voir §14 — MUST HAVE = dérivation `hasBooking` + décision CTA + correctif validation `website` (source du blocker) + correctif `site_web`→`website`. Le reste (profile_type, in-app browser, formulaire admin) explicitement reporté.
14. **Ce qui doit être explicitement validé par le CEO avant tout code** :
    - Autoriser (ou non) la correction du security blocker `website` **dans le même lot** que l'évolution CTA, ou en chantier sécurité séparé et prioritaire (recommandation : prioritaire, indépendant du calendrier CTA).
    - Valider l'option B (secteur + capacités, sans `profile_type`) comme architecture retenue pour Phase 1, ou demander une granularité supplémentaire dès maintenant.
    - Confirmer que l'in-app browser reste explicitement hors de la Phase 1.
    - Confirmer le périmètre MUST/SHOULD/LATER/OUT OF SCOPE du §14.

---

**Aucun code, aucune migration, aucun composant n'a été écrit pendant
cette phase. Phase 1 ne commence pas avant validation explicite du CEO
sur les points du §15-14.**

---

## 16. P0 Stored XSS + site_web — IMPLÉMENTATION (17/08/2026)

Suite directe du §1/§15. GO CEO reçu le 17/08/2026 pour corriger, en
isolation stricte, le security blocker `website` et le bug `site_web`
identifiés en Phase 0.5 — sans toucher au CTA/`profile_type`/booking/
in-app browser. **CLOS** — voir statut détaillé ci-dessous, aucun écart
non classifié.

### 16.1 Fichiers modifiés

| Fichier | Modification | Justification |
|---|---|---|
| `lib/urlValidation.ts` (nouveau) | `validerUrlExterne()` (écriture, strict, allow-list `http:`/`https:` sur `.protocol` après `new URL()`, ne devine jamais de schéma) + `urlExterneSure()` (affichage, tolère l'absence de schéma en fallback `https://`, rejette toujours les schémas dangereux) | Source unique de vérité, seule façon fiable de distinguer `javascript://x` (syntaxiquement valide) d'une vraie URL http(s) — une regex/denylist sur la chaîne brute est contournable |
| `app/api/institution/profile/route.ts` | `payload.website` passé dans `validerUrlExterne()` avant l'UPDATE, 400 si invalide | Ferme le security blocker §1 étape 3 (le PUT n'appliquait aucun contrôle sur `website`) |
| `app/api/institution/auth/register/route.ts` | `website` (optionnel) validé par `validerUrlExterne()` avant l'INSERT si non vide | Même faille possible dès l'inscription, avant même le premier passage par `ProfilEntrepriseTab` |
| `app/institution/[id]/InstitutionPublicClient.tsx` | Type `site_web?` → `website?` ; mapping `r.site_web` → `r.website` ; `websiteHref = urlExterneSure(inst.website)` calculé une fois (ligne ~861), rendu conditionné sur `websiteHref` au lieu de `inst.site_web` | Corrige le bug fonctionnel §2 (colonne morte) **et** ferme l'exposition publique que ce correctif aurait ouverte si posé sans validation de rendu (défense en profondeur sur données historiques déjà en base) |
| `app/admin/partenariats/page.tsx` | `.map(d => (...))` → bloc avec `const websiteHref = urlExterneSure(d.site_web)` ; lien cliquable seulement si `websiteHref` non nul, sinon texte brut non cliquable | Ferme le sink principal identifié §1 étape 9 (session admin) |
| `app/institution/[id]/dashboard/components/MonPartenariatTab.tsx` | `websiteHref = urlExterneSure(institution.website)` ; `href` et fallback `—` basés dessus | Ferme le sink secondaire §1 (auto-XSS institution, faible gravité mais même règle de défense en profondeur) |
| `app/institution/[id]/dashboard/components/ProfilEntrepriseTab.tsx` | `FormField` du champ "Site web" : ajout `type="url"` | Amélioration UX uniquement (validation HTML5 native côté client) — ne constitue jamais la sécurité réelle, qui reste server-side |

**Non touché, volontairement** (hors périmètre P0, cf. décision CEO) : `app/api/institution/partenariat/route.ts` (copie `site_web: inst.website` sans validation locale — accepté car la donnée est désormais propre dès l'écriture source et re-validée à chaque rendu, une 3ᵉ couche de validation à ce point precis aurait été redondante) ; CTA dynamique ; `profile_type` ; système de réservation ; in-app browser.

### 16.2 Tests exécutés réellement — résultats exacts

Exécution directe de `lib/urlValidation.ts` (fichier réel, compilé via `tsc` puis exécuté sous Node — pas une réimplémentation) :

| # | Test | Entrée | Résultat obtenu | Attendu | Statut |
|---|---|---|---|---|---|
| 1 | HTTPS valide (écriture) | `https://nimba-sms.com` | `{valid:true, url:"https://nimba-sms.com/"}` | accepté | **VERIFIED IN CODE** |
| 2 | URL sans protocole (écriture) | `nimba-sms.com` | `{valid:false, error:"..."}` | rejeté (jamais de déduction auto à l'écriture) | **VERIFIED IN CODE** |
| 3 | `javascript:alert(1)` (écriture) | idem | `{valid:false, error:"Seuls les liens commençant par http:// ou https:// sont acceptés."}` | rejeté | **VERIFIED IN CODE** |
| 4 | `javascript://alert(1)` (écriture) | idem | `{valid:false, error:"..."}` | rejeté (variante `//`) | **VERIFIED IN CODE** |
| 5 | URL malformée (écriture) | `http://[::1` | `{valid:false, error:"..."}` | rejeté | **VERIFIED IN CODE** |
| 6 | Rendu admin avec donnée invalide | `urlExterneSure("javascript:alert(1)")` → `null`, code de `admin/partenariats/page.tsx` n'affiche alors qu'un `<span>` texte, jamais de `<a href>` | pas de lien cliquable construit | **VERIFIED IN CODE** (logique confirmée par lecture + exécution unitaire de la fonction ; **NOT VERIFIED IN APPLICATION** — aucun navigateur disponible dans cet environnement pour cliquer réellement) |
| 7 | Rendu institution avec donnée invalide | idem sur `MonPartenariatTab.tsx` (`websiteHref` nul → fallback `—`) | pas de lien cliquable | **VERIFIED IN CODE** ; **NOT VERIFIED IN APPLICATION** (même limite) |
| 8 | Fiche publique avec website valide | `urlExterneSure("https://nimba-sms.com")` → URL non nulle, bouton "Site web" rendu | bouton visible | **VERIFIED IN CODE** ; **NOT VERIFIED IN APPLICATION** (même limite) |
| 9 | Régression URL valide existante | `validerUrlExterne("http://exemple.gn")` → `{valid:true,...}` ; `urlExterneSure("http://exemple.gn")` → URL préservée ; fallback legacy sans schéma (`urlExterneSure("nimba-sms.com")` → `"https://nimba-sms.com/"`) toujours fonctionnel | aucune régression sur données déjà propres ou legacy sans protocole | **VERIFIED IN CODE** |
| 10 | `tsc --noEmit` + `npm run build` | `tsconfig.tsbuildinfo` supprimé puis régénéré (résultat garanti frais, cf. piège déjà rencontré cette session) | `tsc --noEmit` : exit 0, aucune sortie. `npm run build` : exit 0, "Compiled successfully", 304/304 pages générées, aucune erreur | 0 erreur | **VERIFIED IN APPLICATION** (commandes réellement exécutées, sortie complète capturée) |

Tests bonus exécutés au-delà des 10 requis (mêmes fonctions réelles) : `data:` et `file:` toujours rejetés à l'écriture et à l'affichage ; entrée `null`/chaîne vide gérée sans exception.

**Limite honnête** : cet environnement ne dispose d'aucun outil navigateur (rappelé à plusieurs reprises dans ce document et dans `CLAUDE.md`). Les tests 6-8 sont donc vérifiés au niveau du code et de la fonction réelle qui gate le rendu, jamais par un clic réel dans un navigateur ni par une requête HTTP de bout en bout contre l'environnement de dev de Bryan. Aucune donnée en base n'a été lue ou modifiée (interdiction SQL directe) — le test 9 sur "données legacy sans protocole" est donc une vérification de la fonction sur un exemple représentatif (`nimba-sms.com`, cité en commentaire dans le code depuis Phase 0.5), pas une lecture réelle des lignes `institutions.website` existantes.

### 16.3 Seconde relecture sécurité ciblée — résultat

Recherche exhaustive de tous les usages de `website`/`site_web` dans `**/*.{ts,tsx}` (23 fichiers matchés) et de `dangerouslySetInnerHTML`/`window.open`/`iframe` combinés à `website` (0 résultat) :

| Fichier:ligne | Nature | Sink réel ? | Statut |
|---|---|---|---|
| `app/admin/institutions/page.tsx:238` | `['Site web', selected.website \|\| '—']` rendu en `<span>{v}</span>` | Non — texte interpolé, React échappe automatiquement | VERIFIED (safe by construction) |
| `components/DemandePartenariatOverlay.tsx:108` | `<span>{profil?.website}</span>` (aperçu avant soumission de demande de partenariat) | Non — même raison, texte pur | VERIFIED (safe by construction) |
| `app/api/admin/partenariats/route.ts:19`, `app/api/admin/institutions/route.ts:23` | `SELECT` incluant `website`/`site_web` | Non — lecture DB, alimente des rendus déjà couverts ci-dessus | VERIFIED (pas un sink) |
| `app/login/page.tsx:691`, `app/inscription/page.tsx:414`, `app/recuperation-compte/recuperation-client.tsx:142` | Champs honeypot anti-bot nommés `website`/`site_web` | Sans rapport — aucun lien avec `institutions.website` | VERIFIED (faux positif) |
| `lib/canalAcquisition.ts` | `Canal = ... \| "site_web"` — taxonomie de canal d'acquisition | Sans rapport — nom de valeur d'enum, pas la donnée `institutions.website` | VERIFIED (faux positif) |
| `app/guide-prestataire/page.tsx:283` | `url('https://sf16-website-login...woff2')` | Sans rapport — sous-chaîne d'une URL de police statique | VERIFIED (faux positif) |
| `app/institution/inscription/engine/steps/ActiviteStep.tsx:187` | `<input type="text" ...>` (pas `type="url"`) | Pas un sink (c'est une saisie, pas un rendu) — mais incohérence UX mineure avec `ProfilEntrepriseTab` désormais en `type="url"` | **Nouveau constat, non corrigé** (hors périmètre P0 : validation server-side de `register/route.ts` couvre déjà ce point à l'écriture, cf. §16.1) |

**Aucun nouveau sink XSS trouvé.** Les 3 sinks connus (public, admin, institution) sont les seuls existants dans la base de code actuelle.

### 16.4 Régressions

Aucune détectée. `tsc --noEmit` et `npm run build` propres (304/304 pages). Le fallback `urlExterneSure` préserve explicitement le rendu des données legacy sans protocole (cas réel `nimba-sms.com` cité en Phase 0.5).

### 16.5 Risques résiduels / NOT VERIFIED

- **VERIFIED IN DATABASE** (17/08/2026, requêtes exécutées par Bryan) : `institutions` compte 4 lignes au total, dont 1 avec `website` renseigné — aucune valeur à schéma dangereux (non-`http(s)`) trouvée ni dans `institutions.website` ni dans `institution_partenariat_demandes.site_web` (2 requêtes `SELECT ... WHERE ... !~ '^https?://'`, 0 ligne retournée dans les deux cas). Point précédemment NOT VERIFIED, désormais clos.
- **NOT VERIFIED IN APPLICATION/PRODUCTION** : aucun test navigateur réel (clic, rendu visuel, comportement mobile) n'a été possible dans cet environnement — à valider par Bryan.
- **Incohérence UX mineure non corrigée** : `ActiviteStep.tsx:187` reste en `type="text"` — sans risque de sécurité (validation server-side déjà en place), simple confort de saisie à l'inscription, non traité (hors périmètre explicite de ce P0).
- **Aucun commit, aucun déploiement** — modifications présentes uniquement dans l'arborescence de travail locale, conformément à l'instruction CEO.

### 16.6 Statut final

**CLOS** — correctif implémenté, testé au niveau code/build (10/10 tests exécutés réellement), seconde relecture sécurité faite (0 nouveau sink), aucune régression, aucun écart non classifié. Restent explicitement **NOT VERIFIED** : comportement navigateur réel et contenu actuel de la base de données (tous deux hors de portée de cet environnement/protocole, à confirmer par Bryan).
