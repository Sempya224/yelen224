# Yelen Trust — Verification Data Model (Lot 2.2, mis à jour Lot 2.3)

Rédigé le 16/08/2026, sur décision CEO ("GO — Lot 2.2 autorisé", architecture
hybride explicitement imposée en remplacement d'un simple choix Option 1/
Option 2 du Lot 2.1). Fait suite au gel de `docs/product/YELEN_TRUST_MODEL.md`
(Lot 0), à `docs/product/YELEN_TRUST_DOMAIN_ARCHITECTURE.md` (Lot 1, GO), et
à `docs/product/YELEN_TRUST_DATA_AUDIT.md` (Lot 2.1, GO conditionnel — le
constat central de ce lot en est le point de départ direct).

**Mise à jour Lot 2.3 (même jour)** : sur décision CEO explicite, ce document
intègre désormais la décision d'atomicité définitive (fonction transactionnelle
`SECURITY DEFINER`, section E), le protocole de migration en 4 étapes
expand→migrate/backfill→switch→contract (section O), et les invariants
définitifs de traçabilité du déposant (section D). Le détail de
l'implémentation (relecture ligne par ligne du trigger, plan de test des 12
scénarios, résultats) vit dans le document séparé
`docs/product/YELEN_TRUST_VERIFICATION_IMPLEMENTATION_PLAN.md`, comme demandé
explicitement par le CEO ("produire un plan d'implémentation séparé avant de
toucher au code").

**Lot 2.2/2.3 = conception détaillée + plan de migration + plan de test
uniquement.** Aucune modification de code, aucune migration exécutée, aucun
changement Supabase distant, aucun commit, aucun déploiement. Conforme à
CLAUDE.md : Claude Code n'exécute jamais de SQL sur la base réelle — tout SQL
ci-dessous est illustratif, décrit pour préparer le travail de Bryan, jamais
exécuté.

**Méthode** : cartographie exhaustive de tout ce qui lit/écrit
`documents_institution` et le bucket Storage `"documents"` (recherche
dédiée réalisée pour ce lot, citée section par section), croisée avec les
faits déjà VERIFIED IN CODE/DATABASE des Lots 0/1/2.1. Chaque affirmation
porte sa source.

---

## Principe directeur (rappel de la décision CEO)

> "documents_institution = registre des preuves. verification_decisions =
> registre des décisions humaines de vérification. [...] Une décision
> référence les preuves utilisées ; elle ne devient pas elle-même la
> source primaire du document."

Deux responsabilités, strictement séparées, chacune avec sa propre
immuabilité :
- **Historique de la preuve** (`documents_institution`, modifiée) — chaque
  dépôt de document devient une nouvelle version. Aucune resoumission
  n'écrase jamais une version antérieure.
- **Snapshot de la décision** (`verification_decisions` +
  `verification_decision_preuves`, nouvelles) — une décision capture,
  au moment où elle est prise, une copie figée des preuves utilisées,
  indépendante de ce que devient `documents_institution` ensuite.

Ce n'est pas une redondance accidentelle : c'est ce qui garantit qu'une
décision reste explicable même si le document courant est remplacé,
expiré, ou si sa version référencée n'est plus la version active — exigence
explicite du CEO, alignée sur NIST 800-63A-4 (conservation des étapes de
validation et des types de preuves dans les enregistrements du processus).

---

## A. Modèle cible

```
documents_institution (MODIFIÉE — historique versionné, jamais écrasée)
  ├─ id (identité stable d'une VERSION précise)
  ├─ institution_id, type                    [inchangés]
  ├─ numero_version, statut_actif             [NOUVEAU — versionnement]
  ├─ remplace_version_id                      [NOUVEAU — chaîne de versions]
  ├─ statut, motif_rejet, examine_le,
  │  examine_par                              [inchangés, mais immuables
  │                                             une fois décidés — plus de
  │                                             reset par upsert]
  ├─ soumis_par_membre_id                     [NOUVEAU — qui a déposé]
  ├─ storage_path (renommage conseillé de
  │  `url`), hash_integrite                   [NOUVEAU — intégrité fichier]
  └─ nom, soumis_le, cree_le                  [inchangés]

verification_decisions (NOUVELLE — décision axe par axe, insert-only)
  ├─ id, decision_id (YL-VER-{année}-{seq})
  ├─ institution_id, axe ('identite'|'autorite')
  ├─ type_decision, niveau_preuve
  ├─ examinateur_admin_id, examinateur_nom, decide_le, justification
  ├─ expire_le, complement_demande_motif
  ├─ revoque_decision_id, decision_precedente_id
  └─ created_at

verification_decision_preuves (NOUVELLE — snapshot, insert-only, enfant)
  ├─ id, decision_id → verification_decisions
  ├─ document_institution_id → documents_institution (RESTRICT)
  └─ type_snapshot, numero_version_snapshot, statut_snapshot,
     storage_path_snapshot, hash_integrite_snapshot, soumis_le_snapshot,
     examine_le_snapshot, examine_par_nom_snapshot
```

Rien d'autre dans la cartographie du Lot 2.1 n'est touché — `institutions`,
`institution_responsables`, `institution_membres`, `avis`, `signalements`,
`journal_activite`/`admin_logs` restent hors périmètre de ce lot, sauf
comme sources de FK ou de patrons à copier (section B).

---

## B. Tables réutilisées

- **`documents_institution`** — réutilisée et modifiée en place (jamais
  remplacée), voir section D.
- **`admin_users`** — cible de `examine_par` (déjà correcte en base malgré
  le fichier de migration périmé, GAP-06-06) et de
  `verification_decisions.examinateur_admin_id`.
- **`institutions`** — cible finale de `niveau_confiance`/`badge_verifie`
  (calcul dérivé, section G) ; aucune colonne nouvelle sur cette table
  dans ce lot.
- **`institution_membres`** — nouvelle utilisation en lecture seule :
  `documents_institution.soumis_par_membre_id` (nouveau, voir section D)
  et `verification_decision_preuves.examine_par_nom_snapshot` s'appuient
  sur le même patron de snapshot de nom déjà utilisé par
  `journal_activite.membre_nom`/`signalement_events.membre_nom` — pas une
  nouvelle idée, une réapplication.
- **Patron d'immuabilité** (`journal_activite_immuable`/
  `signalement_events_immuable`) — réutilisé pour
  `verification_decisions`/`verification_decision_preuves` (blocage total,
  ces deux tables n'ont aucun cas d'UPDATE légitime). **Réutilisé sous une
  forme adaptée** (pas un copier-coller strict) pour
  `documents_institution`, qui a un besoin d'UPDATE légitime unique et
  borné (l'examen initial) — voir section D.
- **Patron de séquence lisible** (`YL-AUD-`/`YL-DOC-`/`SIG-`/`TRX-`) —
  réutilisé pour `decision_id` (`YL-VER-{année}-{8 chiffres}`), préfixe
  choisi explicitement distinct des 4 préfixes déjà utilisés dans le
  projet pour éviter toute confusion, en particulier avec `YL-DOC-` déjà
  pris par `citoyen_documents` (table sans rapport, confirmé
  `20260724000005_citoyen_documents.sql:9-13`).

---

## C. Tables nouvelles

### `verification_decisions`

Décision humaine axe par axe. Un institution peut avoir plusieurs lignes
dans le temps (une par décision, jamais modifiée après coup — voir
`decision_precedente_id`/`revoque_decision_id` pour le chaînage).

### `verification_decision_preuves`

Table de jonction **et** de snapshot — un rôle double assumé
explicitement : elle relie une décision à N preuves (`document_institution_
id`, FK réelle, `ON DELETE RESTRICT`), **et** elle copie au moment de la
décision les champs qui doivent rester lisibles même si la ligne
`documents_institution` référencée change de statut plus tard (ex.
`statut_actif` passe à `false` suite à une resoumission ultérieure — la
snapshot, elle, ne bouge jamais).

Aucune autre table nouvelle n'est nécessaire pour ce lot — pas de séquence
dédiée en table séparée pour `documents_institution` (son identité de
version repose sur `id` (uuid, stable par nature) + `numero_version`
(entier, lisible), sans avoir besoin d'un préfixe textuel public
supplémentaire, ce qui réduit la surface de ce lot).

---

## D. Modifications nécessaires

### `documents_institution` — colonnes ajoutées (additif, aucune colonne existante supprimée)

| Colonne | Type | Rôle |
|---|---|---|
| `numero_version` | integer NOT NULL DEFAULT 1 | Rang de version pour ce `(institution_id, type)` |
| `statut_actif` | boolean NOT NULL DEFAULT true | Marque la version courante — au plus une active par `(institution_id, type)` |
| `remplace_version_id` | uuid REFERENCES documents_institution(id) ON DELETE SET NULL | Chaîne vers la version précédemment active |
| `soumis_par_membre_id` | uuid REFERENCES institution_membres(id) ON DELETE SET NULL | **Gap trouvé pendant ce lot** : aucune colonne actuelle ne trace qui, côté institution, a déposé un document — incohérent avec le principe "chaque décision traçable" appliqué côté examen mais pas côté dépôt. **Décision Lot 2.3** : toujours dérivé côté serveur de la session JWT institution déjà authentifiée (`membre.id`), jamais accepté depuis le corps de la requête client — même discipline que `institution_id` sur les routes existantes. Vérifié une seconde fois à l'intérieur de la fonction RPC (section E) par défense en profondeur. |
| `hash_integrite` | text nullable | SHA-256 du fichier au moment du dépôt — réutilise un mécanisme déjà utilisé ailleurs dans le projet (export Journal d'activité, "Rapport signé SHA-256", CLAUDE.md `/chantier-journal-activite`), pas une nouvelle brique cryptographique |
| `storage_path` | text | **Renommage conseillé de `url`** (la colonne s'appelle déjà `url` mais stocke un chemin privé, jamais une URL publique — confirmé, aucune route ne l'expose ni ne la lit aujourd'hui en dehors de l'upsert d'écriture). Recommandé, **non bloquant** — zéro route ne lit `url` en sortie (section L), donc risque de renommage nul. |

### `documents_institution` — contrainte remplacée

- **Retirée** : `documents_institution_institution_type_unique UNIQUE
  (institution_id, type)` — c'est elle qui force l'écrasement aujourd'hui.
- **Ajoutée** : un index unique **partiel** —
  ```sql
  CREATE UNIQUE INDEX documents_institution_type_actif_unique
    ON documents_institution (institution_id, type)
    WHERE statut_actif;
  ```
  Garantit au plus une version active par `(institution_id, type)`, sans
  jamais empêcher l'existence de versions historiques inactives — c'est le
  mécanisme central qui rend le versionnement possible sans perdre la
  contrainte métier originale (« un seul document actif par type »).

### `documents_institution` — trigger d'immuabilité **partielle** (nouveau patron, pas un copier-coller)

Contrairement à `journal_activite`/`signalement_events` (blocage total de
tout UPDATE), cette table a un besoin d'UPDATE légitime et borné : l'examen
initial (`statut: recu → {valide|rejete|complement_demande}` +
`motif_rejet`/`examine_le`/`examine_par`), et la désactivation d'une
version quand elle est remplacée (`statut_actif: true → false`). Le
trigger doit donc bloquer toute modification des colonnes qui définissent
« ce qui a été soumis et quand », tout en autorisant ces deux transitions
précises :

```sql
-- Illustratif — non exécuté. À valider ligne par ligne avant toute écriture réelle.
CREATE OR REPLACE FUNCTION documents_institution_interdire_falsification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_documents_institution', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.institution_id  IS DISTINCT FROM OLD.institution_id
     OR NEW.type          IS DISTINCT FROM OLD.type
     OR NEW.numero_version IS DISTINCT FROM OLD.numero_version
     OR NEW.soumis_le     IS DISTINCT FROM OLD.soumis_le
     OR NEW.storage_path  IS DISTINCT FROM OLD.storage_path
     OR NEW.hash_integrite IS DISTINCT FROM OLD.hash_integrite
     OR NEW.soumis_par_membre_id IS DISTINCT FROM OLD.soumis_par_membre_id
     OR NEW.remplace_version_id IS DISTINCT FROM OLD.remplace_version_id
  THEN
    RAISE EXCEPTION 'documents_institution: cette version est figée, seuls statut/motif_rejet/examine_le/examine_par/statut_actif peuvent évoluer (id=%)', OLD.id;
  END IF;

  IF OLD.statut_actif = false AND NEW.statut_actif = true THEN
    RAISE EXCEPTION 'documents_institution: statut_actif ne peut jamais repasser à true (id=%)', OLD.id;
  END IF;

  IF OLD.statut <> 'recu' AND NEW.statut IS DISTINCT FROM OLD.statut THEN
    RAISE EXCEPTION 'documents_institution: statut déjà décidé, immuable (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;
-- BEFORE UPDATE ON documents_institution, échappatoire identique au patron
-- existant : SET LOCAL app.autoriser_correction_documents_institution = 'on'.
-- DELETE reste bloqué sans exception (aucun cas légitime identifié).
```

**Cette conception doit être relue explicitement par Bryan/CEO avant
d'être transformée en migration réelle** — c'est un patron plus complexe
que celui déjà éprouvé deux fois dans ce projet, pas une simple
réutilisation (section N, risque explicite).

### `lib/adminAuth.ts`

- Ajout de la permission `institutions.verify` (déjà recommandée Lot 2.1
  section C), distincte de `institutions.manage`, gate des futures routes
  admin de décision de vérification.

### Storage — chemin versionné (détail section F)

- `${institution_id}/${type}.${ext}` → `${institution_id}/${type}/${document_id}.${ext}`.

### Routes existantes à modifier

Détail complet section L — résumé : les 3 sites de lecture doivent filtrer
`statut_actif = true`, le site d'écriture doit passer d'un upsert
destructeur à un insert de nouvelle version + désactivation de l'ancienne.

---

## E. Stratégie de versionnement des preuves

1. Une resoumission n'est **jamais** un `UPDATE`/`UPSERT` sur la ligne
   existante — c'est toujours un `INSERT` d'une nouvelle ligne avec
   `numero_version = ancien_max + 1`, `statut_actif = true`,
   `remplace_version_id = id_de_l_ancienne_version_active`.
2. Dans la **même opération métier**, l'ancienne version active doit
   passer à `statut_actif = false` (autorisé par le trigger de la section
   D, jamais l'inverse).

### Décision définitive (Lot 2.3, CEO) — fonction transactionnelle PostgreSQL

**Tranché : option RPC (fonction `SECURITY DEFINER` unique), pas deux
appels séquentiels.** Le fait que ce soit le premier `.rpc()` du projet
(confirmé, `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` section 08 :
"Zéro `.rpc()`... exclusivement client Supabase typé") n'est pas un motif
suffisant pour éviter la primitive dont ce domaine de données a réellement
besoin — l'opération « créer la nouvelle version + désactiver l'ancienne »
doit être validée ou annulée comme un tout, exactement ce que fournissent
les transactions PostgreSQL et que deux appels HTTP séquentiels ne peuvent
pas garantir.

**Garde-fous explicites sur cette exception à la convention** (RPC ne veut
pas dire logique métier incontrôlée) :
- Fonction **minimale, fortement typée, limitée à cette seule opération**
  — jamais un RPC générique (`execute_sql` ou équivalent) : une primitive
  métier ciblée, pas une porte arrière vers la base.
- Appelée **exclusivement avec la clé `service_role`**, jamais exposée à
  `anon`/`authenticated` (`REVOKE`/`GRANT` explicites, voir ci-dessous) —
  cohérent avec le fait que l'authentification institution est un JWT
  custom, pas une session Supabase Auth : Postgres/RLS ne peut de toute
  façon jamais authentifier un membre institution directement.
- L'autorisation métier (le membre a-t-il le droit de déposer un document
  pour cette institution ?) reste vérifiée **côté route Next.js avant
  l'appel RPC** (`can(membre.role, "documents_institutionnels.write")`,
  déjà en place) — la fonction ajoute une **second vérification défensive
  interne** (ci-dessous) plutôt que de faire reposer toute la sécurité sur
  un seul point.

```sql
-- Illustratif — non exécuté. Fait partie du plan d'implémentation détaillé,
-- voir docs/product/YELEN_TRUST_VERIFICATION_IMPLEMENTATION_PLAN.md.
CREATE OR REPLACE FUNCTION deposer_nouvelle_version_document(
  p_institution_id uuid,
  p_type text,
  p_nom text,
  p_storage_path text,
  p_hash_integrite text,
  p_soumis_par_membre_id uuid
) RETURNS documents_institution
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ancienne documents_institution;
  v_nouvelle documents_institution;
BEGIN
  -- Défense en profondeur : le membre doit réellement appartenir à
  -- l'institution ciblée. La vérification de permission fine (rôle admin,
  -- documents_institutionnels.write) reste faite en amont côté route —
  -- ce contrôle-ci ne fait que refuser une incohérence d'appelant.
  IF NOT EXISTS (
    SELECT 1 FROM institution_membres
    WHERE id = p_soumis_par_membre_id
      AND institution_id = p_institution_id
      AND actif
  ) THEN
    RAISE EXCEPTION 'deposer_nouvelle_version_document: membre non autorisé pour cette institution (institution_id=%, membre_id=%)', p_institution_id, p_soumis_par_membre_id;
  END IF;

  -- Verrou consultatif transactionnel : bloque toute transaction concurrente
  -- sur la même paire (institution_id, type) jusqu'au COMMIT/ROLLBACK de
  -- celle-ci — élimine la fenêtre de course sans verrouiller toute la table.
  PERFORM pg_advisory_xact_lock(hashtext(p_institution_id::text || ':' || p_type));

  SELECT * INTO v_ancienne
  FROM documents_institution
  WHERE institution_id = p_institution_id AND type = p_type AND statut_actif
  FOR UPDATE;

  IF v_ancienne.id IS NOT NULL THEN
    UPDATE documents_institution SET statut_actif = false WHERE id = v_ancienne.id;
  END IF;

  INSERT INTO documents_institution (
    institution_id, type, nom, storage_path, hash_integrite,
    statut, soumis_le, numero_version, statut_actif,
    remplace_version_id, soumis_par_membre_id
  ) VALUES (
    p_institution_id, p_type, p_nom, p_storage_path, p_hash_integrite,
    'recu', now(), COALESCE(v_ancienne.numero_version, 0) + 1, true,
    v_ancienne.id, p_soumis_par_membre_id
  )
  RETURNING * INTO v_nouvelle;

  RETURN v_nouvelle;
  -- Toute exception levée avant le RETURN annule automatiquement la
  -- transaction complète (aucune moitié d'opération ne peut être commitée) —
  -- propriété native de PostgreSQL, pas une garantie ajoutée manuellement.
END;
$$;

REVOKE ALL ON FUNCTION deposer_nouvelle_version_document FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION deposer_nouvelle_version_document(uuid,text,text,text,text,uuid) TO service_role;
```

**`p_soumis_par_membre_id` ne doit jamais provenir directement du corps de
la requête HTTP** — la route appelante doit le dériver de l'identité déjà
authentifiée par le JWT institution (`membre.id` résolu par
`institutionAuth`), exactement comme `institution_id` l'est déjà
aujourd'hui pour les routes existantes de ce fichier. Détail complet du
raisonnement et des tests de contournement dans le plan d'implémentation
(section correspondante).

Le détail de la relecture ligne par ligne de cette fonction, des scénarios
de concurrence testés, et du protocole de validation avant migration réelle
figure dans `docs/product/YELEN_TRUST_VERIFICATION_IMPLEMENTATION_PLAN.md`
(Lot 2.3).

---

## F. Stratégie Storage

- **Nouveau chemin** : `${institution_id}/${type}/${document_id}.${ext}`,
  où `document_id` est l'`id` (uuid) de la nouvelle ligne
  `documents_institution` — jamais de collision possible entre versions.
- **Ordre d'écriture recommandé** (évite les métadonnées orphelines
  pointant vers un fichier jamais réellement écrit) :
  1. Générer l'uuid côté application (`crypto.randomUUID()`).
  2. Upload Storage vers le chemin versionné utilisant cet uuid,
     `upsert: false` (plus jamais nécessaire — chaque chemin est unique
     par construction ; un conflit signifierait un vrai bug, pas un cas
     normal à absorber silencieusement).
  3. Insérer la ligne `documents_institution` avec `id` explicitement égal
     à l'uuid généré à l'étape 1 (Postgres accepte un `id` fourni
     explicitement même quand la colonne a un `DEFAULT` — le défaut ne
     s'applique que si la valeur est omise).
  4. Si l'étape 3 échoue après un succès de l'étape 2 : fichier orphelin
     en Storage sans ligne DB correspondante — nuisance mineure (espace
     de stockage), jamais un risque d'intégrité (aucune ligne ne pointera
     jamais vers un fichier inexistant, propriété inverse préférable à
     l'ordre implicite actuel).
- **Fichiers déjà présents sous l'ancien chemin fixe** (`${institution_id}/
  ${type}.${ext}`) : **NOT VERIFIED** si des fichiers réels existent
  aujourd'hui à ce chemin — le bucket `documents` a été trouvé **jamais
  créé** en production le 14/08/2026 (CLAUDE.md
  `/actions-manuelles-en-attente`), donc probablement aucun fichier réel
  n'existe encore. À confirmer par Bryan avant migration (section J).
- **Dépendance bloquante déjà connue, réaffirmée ici** : le bucket
  `documents` doit être créé (Public décoché) avant que quoi que ce soit
  dans ce lot puisse être testé de bout en bout — indépendant de ce
  document, déjà sur la liste d'actions manuelles de Bryan.

---

## G. Stratégie snapshot

`verification_decision_preuves` capture, **au moment de la décision**, une
copie figée de chaque preuve utilisée — jamais une simple référence par id
seul. Champs et justification :

| Champ snapshot | Pourquoi une copie et pas juste une référence |
|---|---|
| `type_snapshot` | Le type ne change jamais en pratique, mais fige la lecture sans dépendre d'un JOIN futur |
| `numero_version_snapshot` | Identifie precisément *quelle* version a été examinée |
| `statut_snapshot` | Le statut de la ligne source peut en théorie continuer d'exister à `recu` alors que la décision globale a tranché — le snapshot fige ce qui a compté pour CETTE décision |
| `storage_path_snapshot` | Permet de retrouver le fichier exact même si `documents_institution.storage_path` de la ligne source n'a pas de raison de changer, mais garantit l'indépendance totale |
| `hash_integrite_snapshot` | Preuve d'intégrité — permet de vérifier des années plus tard que le fichier actuellement à ce chemin (s'il existe encore) est bien celui examiné |
| `soumis_le_snapshot` / `examine_le_snapshot` | Chronologie complète sans dépendre de la ligne source |
| `examine_par_nom_snapshot` | Nom, pas seulement l'id — résiste à la suppression du compte admin (`examinateur_admin_id` sur la décision elle-même a déjà `ON DELETE SET NULL`, mais le nom en clair sur le snapshot de preuve garantit la lisibilité même dans ce cas) |

**Non-duplication de responsabilité (réponse directe à l'item 5 du CEO)** :
`documents_institution` reste la **source primaire** du document (le
fichier, son cycle de vie de dépôt/examen individuel). Le snapshot ne
duplique jamais le fichier lui-même (aucune copie de fichier en Storage),
seulement des métadonnées déjà présentes sur la ligne source au moment de
la décision — c'est un instantané de lecture, pas une nouvelle vérité.

---

## H. Contraintes SQL (illustratif, non exécuté)

### `documents_institution` (ajouts)
- `numero_version integer NOT NULL DEFAULT 1`
- `statut_actif boolean NOT NULL DEFAULT true`
- `remplace_version_id uuid REFERENCES documents_institution(id) ON DELETE SET NULL`
- `soumis_par_membre_id uuid REFERENCES institution_membres(id) ON DELETE SET NULL`
- `hash_integrite text`
- `CREATE UNIQUE INDEX documents_institution_type_actif_unique ON documents_institution (institution_id, type) WHERE statut_actif;` (remplace l'ancienne UNIQUE globale)
- Trigger `documents_institution_immuable_partiel` — voir section D.

### `verification_decisions`
```sql
-- Illustratif — non exécuté.
CREATE TABLE verification_decisions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id text NOT NULL UNIQUE DEFAULT verification_decisions_generer_id(),
  institution_id uuid NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  axe text NOT NULL CHECK (axe IN ('identite','autorite')),
  type_decision text NOT NULL CHECK (type_decision IN ('accordee','complement_demande','rejetee','revoquee')),
  niveau_preuve text CHECK (niveau_preuve IN ('profil_verifie','institution_certifiee')),
  examinateur_admin_id uuid REFERENCES admin_users(id) ON DELETE SET NULL,
  examinateur_nom text NOT NULL,
  decide_le timestamptz NOT NULL DEFAULT now(),
  justification text NOT NULL,
  expire_le timestamptz,
  complement_demande_motif text,
  revoque_decision_id uuid REFERENCES verification_decisions(id) ON DELETE SET NULL,
  decision_precedente_id uuid REFERENCES verification_decisions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT verification_decisions_niveau_preuve_requis
    CHECK (type_decision <> 'accordee' OR niveau_preuve IS NOT NULL),
  CONSTRAINT verification_decisions_complement_motif_requis
    CHECK (type_decision <> 'complement_demande' OR complement_demande_motif IS NOT NULL),
  CONSTRAINT verification_decisions_revocation_reference
    CHECK (type_decision <> 'revoquee' OR revoque_decision_id IS NOT NULL)
);
```
(`niveau_preuve` nullable au niveau colonne mais rendu obligatoire par CHECK
uniquement quand `type_decision='accordee'` — un rejet n'a pas de palier.)

### `verification_decision_preuves`
```sql
-- Illustratif — non exécuté.
CREATE TABLE verification_decision_preuves (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  decision_id uuid NOT NULL REFERENCES verification_decisions(id) ON DELETE CASCADE,
  document_institution_id uuid NOT NULL REFERENCES documents_institution(id) ON DELETE RESTRICT,
  type_snapshot text NOT NULL,
  numero_version_snapshot integer NOT NULL,
  statut_snapshot text NOT NULL,
  storage_path_snapshot text NOT NULL,
  hash_integrite_snapshot text,
  soumis_le_snapshot timestamptz NOT NULL,
  examine_le_snapshot timestamptz,
  examine_par_nom_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now()
);
```
`ON DELETE CASCADE` vers `verification_decisions` (le snapshot n'a pas de
sens sans sa décision) ; `ON DELETE RESTRICT` vers `documents_institution`
(interdit explicitement de supprimer une version de preuve déjà référencée
par une décision — cohérent avec l'invariant 7, même si `documents_
institution` devient par ailleurs une table où `DELETE` n'a de toute façon
aucun cas légitime, section D).

---

## I. RLS / policies

Les trois objets (`documents_institution` modifiée, `verification_decisions`,
`verification_decision_preuves`) suivent strictement la recommandation de
la section 3 du Lot 2.1 — **RLS activé + zéro policy + `REVOKE` explicite
dès la création**, pas une présomption a posteriori :

```sql
-- Illustratif — non exécuté, à exécuter dans la même migration que la création.
ALTER TABLE verification_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_decision_preuves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON verification_decisions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON verification_decision_preuves FROM PUBLIC, anon, authenticated;
-- documents_institution existe déjà : le REVOKE explicite (jamais fait à
-- sa création en 2026-07-11) est une correction rétroactive recommandée
-- dans la même migration qui ajoute les nouvelles colonnes.
REVOKE ALL ON documents_institution FROM PUBLIC, anon, authenticated;
```

Aucune policy sur aucune des trois — accès exclusivement `service_role`,
cohérent avec 100% des tables sensibles déjà cartographiées au Lot 2.1
(aucune de ces trois n'a de raison d'être lue/écrite directement par une
session `authenticated` citoyen ou institution).

---

## J. Stratégie de migration des données existantes

Constat central, déjà établi au Lot 2.1 et reconfirmé par la recherche
dédiée de ce lot : **aucune route n'a jamais écrit `statut ∈
{valide,rejete,complement_demande}` ni `examine_par`/`examine_le`** — donc
toute ligne existante aujourd'hui est nécessairement à `statut='recu'`,
sans décision associée. Ceci simplifie fortement la migration : il n'existe
aucun historique de décision à préserver rétroactivement, seulement des
dépôts en attente.

**Inventaire préalable obligatoire (Lot 2.3, avant toute migration — pas
seulement un comptage de statuts)** :
0. **Quatre vérifications par Bryan**, dans cet ordre, résultats à coller
   dans le plan d'implémentation avant d'écrire la moindre migration réelle :
   ```sql
   -- (i) Volume et répartition par statut
   SELECT statut, count(*) FROM documents_institution GROUP BY statut;
   SELECT count(*) FROM documents_institution;

   -- (ii) Doublons résiduels sur (institution_id, type) — doit renvoyer
   -- zéro ligne puisque l'ancienne contrainte UNIQUE les interdit déjà,
   -- vérification de cohérence plutôt qu'une attente réelle de résultat
   SELECT institution_id, type, count(*)
   FROM documents_institution GROUP BY institution_id, type HAVING count(*) > 1;

   -- (iii) Colonnes réellement peuplées (nom/url/soumis_le) pour confirmer
   -- qu'aucune ligne n'a de valeur inattendue avant de les faire porter V1
   SELECT id, institution_id, type, nom, url, soumis_le
   FROM documents_institution ORDER BY institution_id, type;
   ```
   (iv) **Correspondance Storage** — Bryan confirme dans le dashboard
   Supabase Storage si le bucket `documents` existe et, s'il existe,
   liste son contenu réel (chemins présents) pour croiser avec les
   `url`/chemins attendus des lignes ci-dessus. Toute ligne DB sans
   fichier correspondant (ou l'inverse) doit être documentée, jamais
   supprimée silencieusement.
1. **Décision explicite pour chaque ligne existante** : chaque ligne
   trouvée par (iii) devient sa propre `numero_version = 1`,
   `statut_actif = true`, `remplace_version_id = NULL` — aucune ligne
   existante n'est fusionnée, dupliquée ou supprimée pour simplifier la
   migration (consigne CEO explicite, item 8 : "ne rien supprimer").
2. Migration additive : `ADD COLUMN` des 5 nouvelles colonnes (section D)
   avec leurs défauts (`numero_version DEFAULT 1`, `statut_actif DEFAULT
   true`) — toute ligne existante devient automatiquement "version 1,
   active", cohérent avec la réalité (aucune n'a jamais été remplacée).
3. `soumis_par_membre_id` restera `NULL` pour toutes les lignes
   historiques (l'information n'a jamais été capturée) — **perte de
   donnée acceptée, pas récupérable**, à documenter explicitement comme
   telle plutôt que de deviner un membre.
4. `hash_integrite` restera `NULL` pour les lignes historiques (aucun
   fichier réel probablement présent en Storage, section F) — cohérent.
5. `DROP CONSTRAINT documents_institution_institution_type_unique`, puis
   `CREATE UNIQUE INDEX ... WHERE statut_actif` (section H) — **aucun
   risque de doublon à ce moment** puisque l'ancienne contrainte a
   garanti l'unicité stricte jusqu'ici (contrairement à la migration
   d'origine du 11/07/2026 qui, elle, ajoutait cette contrainte à une
   table qui ne l'avait pas encore — situation différente, pas de
   vérification de doublons nécessaire ici).
6. Ajout du trigger d'immuabilité partielle.
7. Création de `verification_decisions`/`verification_decision_preuves`
   (aucune donnée à migrer, tables vides à la création).

---

## K. Stratégie rollback

- **Étapes 2-4 (additions de colonnes)** : rollback trivial,
  `DROP COLUMN` — aucune dépendance descendante tant que le code
  applicatif n'a pas encore été mis à jour pour les utiliser.
- **Étape 5 (remplacement de la contrainte)** : rollback sûr **seulement
  dans une fenêtre où aucune deuxième version n'a encore été créée** — dès
  qu'une institution soumet une resoumission réelle sous le nouveau
  schéma, revenir à l'ancienne `UNIQUE(institution_id, type)` globale
  échouerait naturellement (violation de contrainte sur les lignes
  historiques désormais dupliquées par `type`) — **Postgres refuse
  lui-même un rollback dangereux à ce stade**, propriété de sécurité
  utile à noter plutôt qu'un risque.
- **Storage (chemin versionné)** : non rollback-able automatiquement pour
  les fichiers déjà uploadés sous le nouveau chemin sans copie manuelle —
  risque jugé faible aujourd'hui car aucune route ne lit `storage_path`
  en sortie (section L), donc un rollback de code peut ignorer le
  contenu du Storage sans casser l'affichage existant.
- **`verification_decisions`/`verification_decision_preuves`** :
  rollback trivial (`DROP TABLE`) tant qu'aucune vraie décision n'a été
  prise — au-delà, ce serait une perte de données historiques réelles,
  à éviter par principe (invariant 7) plutôt que par mécanisme technique.

---

## L. Impact sur les routes existantes

Cartographie exhaustive (recherche dédiée, aucun autre site trouvé dans
tout le dépôt) :

| Route | Aujourd'hui | Changement requis |
|---|---|---|
| `app/api/institution/documents/route.ts` GET (L32-36) | `.select("type,statut,motif_rejet,soumis_le").eq("institution_id",...)`, puis `.find()` par type | **Requis** — ajouter `.eq("statut_actif", true)`, sinon dès la première resoumission réelle le `.find()` pourrait retrouver une version historique au lieu de la version active selon l'ordre de retour (silencieux, pas un crash) |
| `app/api/institution/documents/route.ts` POST, pré-check (L90-95) | `.eq("type",type).maybeSingle()` | **Requis** — ajouter `.eq("statut_actif", true)`, sinon `.maybeSingle()` lèvera une vraie erreur dès qu'une 2e version existe (échoue fort, mais casse la route sans le correctif) |
| `app/api/institution/documents/route.ts` POST, écriture (L114-127) | `upsert(..., {onConflict:"institution_id,type"})` | **Réécriture complète** — insert nouvelle version + update de l'ancienne (section E), upload Storage vers chemin versionné (section F) — **ce changement doit être déployé dans la même version que le changement de contrainte DB (étape 5 de la section J)**, jamais indépendamment (l'ancien `onConflict` cesserait de correspondre à une contrainte réelle dès que l'index unique partiel remplace l'UNIQUE globale) |
| `app/api/institution/configuration-status/route.ts` (L42, 119) | `.select("type,statut").eq("institution_id",...)`, `.find()` par type | **Requis** — même correctif que la GET ci-dessus |
| `app/api/institution/profile/route.ts` (L145-150) | `.select("id",{count:"exact",head:true})` — verrouille `statut_juridique` si `count>0` | **Aucun changement nécessaire** — compter *toute* ligne (active ou non) reste sémantiquement correct : "au moins un document a déjà été soumis un jour" reste vrai indépendamment du versionnement |
| `DocumentsTab.tsx` | Consomme le JSON de la GET route | **Aucun changement direct** — hérite automatiquement de la correction en amont |
| Routes admin de décision | **N'existent pas encore** | Hors périmètre de ce lot (conception uniquement) — nécessaires au Lot 2.3+ pour exercer réellement `verification_decisions` |

**Point de séquencement critique** : la modification de contrainte (DB,
section J étape 5) et la réécriture de la route POST (code) forment une
**paire non déployable indépendamment** — contrairement aux 2 correctifs
de lecture (GET/configuration-status), qui sont sûrs à déployer en avance
(no-op tant que l'ancienne contrainte garantit une seule ligne par type de
toute façon).

---

## M. Scénarios de test (design-level)

Reprend et étend les scénarios du Lot 2.1 §7 à la lumière de ce modèle :

- **Document remplacé** (le scénario central) : soumission 1 (`recu`) →
  rejet admin (`rejete`, `examine_par`/`examine_le` renseignés) →
  resoumission → **vérifier** : (a) la ligne 1 existe toujours,
  `statut='rejete'` intact, `statut_actif=false` ; (b) une ligne 2 existe,
  `numero_version=2`, `statut_actif=true`, `remplace_version_id=id(ligne 1)` ;
  (c) le fichier Storage de la ligne 1 existe toujours à son chemin
  d'origine, un nouveau fichier existe au chemin de la ligne 2.
- **Décision référence une preuve qui devient ensuite inactive** : décision
  accordée référençant la ligne 2 (`statut_actif=true` au moment de la
  décision) → institution soumet une version 3 plus tard (renouvellement)
  → **vérifier** que `verification_decision_preuves` de la décision
  d'origine conserve son `statut_snapshot`/`storage_path_snapshot` intacts,
  indépendamment du fait que la ligne 2 soit maintenant `statut_actif=false`.
- **Tentative de suppression d'une preuve référencée** : `DELETE FROM
  documents_institution WHERE id = <référencée par une décision>` → doit
  échouer (`ON DELETE RESTRICT`).
- **Course de resoumission concurrente** : deux appels quasi simultanés à
  `deposer_nouvelle_version_document()` pour le même
  `(institution_id, type)` → le verrou consultatif transactionnel
  (`pg_advisory_xact_lock`) doit sérialiser les deux transactions — la
  seconde attend la fin de la première puis s'exécute sur l'état déjà à
  jour (elle désactive la version que la première vient de créer, pas
  celle qui existait avant) ; **aucune des deux ne doit jamais échouer
  silencieusement ni produire deux lignes `statut_actif=true`**. Détail du
  protocole de test (verrou relâché sur `ROLLBACK`, comportement sous
  charge simulée) dans le plan d'implémentation, section tests 5-6.
- **Falsification tentée d'une ligne figée** : `UPDATE documents_
  institution SET soumis_le = ... WHERE statut <> 'recu'` sans
  l'échappatoire `SET LOCAL` → doit lever l'exception du trigger.
- **Document expiré / changement de responsable** : confirmés **hors
  périmètre de ce lot précis** — l'expiration vit sur
  `verification_decisions.expire_le` (déjà couvert), le changement de
  responsable reste un vide non traité (`institution_responsables` non
  touchée ici, cohérent avec le Lot 2.1 qui l'avait déjà classé "MANQUANT
  → À CRÉER" séparément).

---

## N. Risques

- **Bucket Storage `documents` toujours pas créé** — bloquant opérationnel
  déjà connu, indépendant de ce lot mais prérequis absolu à tout test de
  bout en bout.
- **Trigger d'immuabilité partielle** — patron nouveau pour ce projet (les
  deux triggers existants bloquent tout, celui-ci autorise des transitions
  précises) : surface de bug plus grande qu'un copier-coller, **doit être
  relu explicitement avant migration réelle**, pas simplement fait
  confiance sur la base de ce document. Protocole de relecture et de test
  détaillé dans le plan d'implémentation.
- **Surface d'attaque de la fonction `SECURITY DEFINER`** (résiduel après
  la décision Lot 2.3) — une fonction `SECURITY DEFINER` s'exécute avec
  les privilèges de son propriétaire, pas de l'appelant : toute faille
  dans sa logique (ex. `p_soumis_par_membre_id` mal validé) contournerait
  RLS par construction. Compensé par (a) `REVOKE`/`GRANT` limitant
  l'exécution au seul `service_role`, (b) la vérification défensive interne
  (section E), (c) `search_path` fixé explicitement (`SET search_path =
  public`, empêche une attaque par détournement de schéma) — **mais reste
  un risque de nature différente de tout ce qui existe déjà dans ce
  projet** (première fonction `SECURITY DEFINER` appelée par le code
  applicatif plutôt que par un trigger interne), à relire avec la même
  rigueur que le trigger.
- **Verrou consultatif (`pg_advisory_xact_lock`) mal dimensionné** — le
  verrou est scindé par `hashtext(institution_id || ':' || type)` : une
  collision de hash entre deux paires `(institution_id, type)` différentes
  sérialiserait deux opérations sans rapport (dégradation de performance
  bénigne, jamais une incohérence de données) — risque théorique, impact
  nul sur la correction, seulement sur la latence en cas de collision
  improbable.
- **Séquencement DB/code non indépendant** (section L) — la modification
  de contrainte, le déploiement de la fonction RPC, et la réécriture de la
  route POST doivent être livrées ensemble (stage SWITCH, section O) ; un
  déploiement partiel casserait la soumission de documents en production
  le temps de l'écart.
- **Fichiers orphelins possibles sous l'ancien chemin fixe** — impact
  jugé faible (bucket probablement jamais réellement utilisé, section F),
  mais **NOT VERIFIED** tant que Bryan n'a pas confirmé l'état réel du
  bucket et son contenu (inventaire section J étape 0).
- **Perte de `soumis_par_membre_id` pour l'historique** (section J,
  étape 1) — acceptée explicitement plutôt que devinée, cohérent avec la
  discipline "zéro donnée inventée".

---

## O. Plan de migration par étapes — stratégie `expand → migrate/backfill → switch → contract`

Décision CEO explicite (Lot 2.3, item 9) : ne jamais déployer une rupture
brutale qui casse le code existant avant que le code compatible soit prêt.
Les 4 stades ci-dessous remplacent la liste plate du Lot 2.2 — chaque stade
est un jalon de déploiement cohérent, pas une étape isolée.

### Stade EXPAND — additif, zéro risque, déployable seul
- `ADD COLUMN` des 5 nouvelles colonnes sur `documents_institution` avec
  défauts sûrs (section D/H) — le code existant continue de fonctionner à
  l'identique (ignore les nouvelles colonnes).
- Création de la fonction `deposer_nouvelle_version_document()` (section E)
  — **créée mais non encore appelée par aucune route**, `REVOKE`/`GRANT`
  posés dès sa création.
- Création de `verification_decisions` + `verification_decision_preuves`
  (RLS + zéro policy + REVOKE dès la création, section I) — vides, aucune
  dépendance vers les routes existantes, aucun risque.
- `REVOKE ALL ON documents_institution FROM PUBLIC, anon, authenticated`
  (correction rétroactive, section I).
- Déploiement des correctifs de lecture (GET, `configuration-status`)
  ajoutant `.eq("statut_actif", true)` — no-op tant que le stade SWITCH n'a
  pas eu lieu (une seule ligne active par type de toute façon à ce stade).
- **Testable et observable en production sans aucun changement de
  comportement utilisateur.**

### Stade MIGRATE/BACKFILL — données, zéro risque
- Exécution par Bryan de l'inventaire complet (section J étape 0 : volume,
  doublons, correspondance Storage).
- Backfill explicite (déjà couvert par les défauts de colonnes du stade
  EXPAND, donc normalement un no-op réel — cette étape sert de
  confirmation, pas d'action corrective) : chaque ligne existante devient
  `numero_version=1`, `statut_actif=true`.
- **Aucune ligne supprimée ou fusionnée** (consigne CEO item 8).

### Stade SWITCH — DB + code livrés ensemble, fenêtre de risque la plus élevée
- `DROP` de l'ancienne contrainte `UNIQUE(institution_id,type)`, `CREATE`
  de l'index unique partiel (section H).
- Ajout du trigger d'immuabilité partielle (section D) — relu et testé au
  préalable (plan d'implémentation).
- Déploiement simultané de la réécriture de la route POST (appel à
  `deposer_nouvelle_version_document()` + upload Storage versionné,
  section F) et de `soumis_par_membre_id` dérivé de la session.
- **Ne jamais déployer un sous-ensemble de ce stade** — l'ancien `upsert`
  cesserait de correspondre à une contrainte réelle dès que l'index partiel
  remplace l'UNIQUE globale (section L).

### Stade CONTRACT — nettoyage, après confirmation en production
- Correction du fichier de migration périmé `20260711000005_documents_
  institution_workflow.sql` (`admins`→`admin_users`, GAP-06-06, cosmétique).
- Renommage effectif `url`→`storage_path` si non fait au stade EXPAND
  (section D, non bloquant).
- Retrait de toute instrumentation de debug ajoutée pendant les tests du
  stade SWITCH (logs temporaires sur le verrou consultatif, par exemple).
- Routes admin réelles pour exercer `verification_decisions` — **hors
  périmètre du Lot 2.3**, nécessaires au Lot 2.4+.

---

## P. GO / NO-GO

### Lot 2.3 — reçu (CEO, 16/08/2026)

Les 4 conditions posées à la clôture du Lot 2.2 sont tranchées :

| Condition (Lot 2.2) | Décision Lot 2.3 |
|---|---|
| État réel du bucket Storage | À vérifier par Bryan avant migration (section J étape 0, toujours ouvert) |
| Atomicité (a)/(b) | **(b) retenue définitivement** — fonction `SECURITY DEFINER` transactionnelle (section E) |
| Relecture du trigger | Obligatoire avant migration réelle — protocole détaillé dans le plan d'implémentation |
| Séquencement DB+code | **Stratégie expand→migrate→switch→contract** adoptée (section O) plutôt qu'un déploiement en deux temps |

### GO/NO-GO pour le Lot 2.4

Reporté au document séparé
`docs/product/YELEN_TRUST_VERIFICATION_IMPLEMENTATION_PLAN.md`, qui
contient le protocole de relecture du trigger, le plan des 12 tests exigés
par le CEO, et le rapport de risques résiduels — conformément à
l'instruction CEO de produire "un plan d'implémentation séparé avant de
toucher au code". Arrêt obligatoire à la fin du Lot 2.3, comme demandé.
Aucun code, migration, changement Supabase, ou commit dans ce lot.
