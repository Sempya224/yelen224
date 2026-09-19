# Yelen Trust — Verification Implementation Plan (Lot 2.3)

Rédigé le 16/08/2026, sur décision CEO ("GO — Lot 2.3 autorisé sous décision
architecturale définitive"). Document séparé du modèle de données
(`docs/product/YELEN_TRUST_VERIFICATION_DATA_MODEL.md`, mis à jour en
parallèle avec la décision RPC), comme demandé explicitement : *"Puis
produire un plan d'implémentation séparé avant de toucher au code."*

**Mise à jour 16/08/2026** : Lot 2.3 exécuté et clos (voir
`YELEN_TRUST_VERIFICATION_MIGRATION_REPORT.md`, 15/15 tests VERIFIED IN
DATABASE). Le projet est désormais au Lot 2.5 — "Admin Verification
Workflow", voir `docs/product/YELEN_TRUST_VERIFICATION_ADMIN_WORKFLOW.md`
— qui construit l'interface/les routes admin permettant d'exercer
réellement le RPC et le trigger décrits ci-dessous, jusqu'ici jamais
appelés que par des scripts de test.

**Lot 2.3 reste un chantier contrôlé.** Aucun commit. Aucun déploiement.
Aucun changement Supabase production. Tout SQL ci-dessous est illustratif —
préparé pour Bryan, jamais exécuté par Claude Code. Ce document produit un
**plan de test**, pas des **résultats de test** : aucune migration n'existe
encore, donc aucun des 12 scénarios demandés par le CEO n'a pu être
réellement exécuté dans cette session. Chaque scénario est spécifié avec
assez de précision pour être exécuté tel quel par Bryan (ou lors du Lot 2.4)
en environnement de test, avec la requête exacte de vérification. Le
signaler ainsi plutôt que de prétendre un résultat est une exigence du
protocole du projet (CLAUDE.md `/honnetete`).

---

## 1. Fonction RPC — relecture ligne par ligne

Fonction définie section E de `YELEN_TRUST_VERIFICATION_DATA_MODEL.md` :
`deposer_nouvelle_version_document(p_institution_id, p_type, p_nom,
p_storage_path, p_hash_integrite, p_soumis_par_membre_id)`.

| Ligne / bloc | Ce qu'il fait | Pourquoi c'est sûr |
|---|---|---|
| `SECURITY DEFINER` + `SET search_path = public` | Exécute avec les privilèges du propriétaire de la fonction, jamais ceux de l'appelant | Le `search_path` fixé explicitement empêche une attaque classique de détournement de schéma sur une fonction `SECURITY DEFINER` (un attaquant créant un objet de même nom dans un schéma prioritaire) — sans cette ligne, la fonction serait vulnérable même si le reste du code est correct |
| Vérification `institution_membres` (premier bloc) | Rejette si `p_soumis_par_membre_id` n'appartient pas à `p_institution_id` ou n'est pas `actif` | Défense en profondeur — la vérification de permission fine (`documents_institutionnels.write`, réservée au rôle `admin`) reste faite **avant** l'appel, côté route ; ce contrôle n'empêche qu'une incohérence d'appelant (ex. bug côté route passant un `membre_id` d'une autre institution) |
| `pg_advisory_xact_lock(hashtext(...))` | Verrou nommé, portée transaction, libéré automatiquement au `COMMIT`/`ROLLBACK` | Élimine la fenêtre de course sans verrouiller toute la table ni dépendre d'un retry côté client — deux appels concurrents sur la même paire `(institution_id, type)` sont sérialisés, deux paires différentes ne se bloquent jamais entre elles |
| `SELECT ... FOR UPDATE` sur la version active | Verrouille la ligne active (si elle existe) pour la durée de la transaction | Combiné au verrou consultatif, empêche toute lecture stale de "quelle est la version active actuelle" pendant l'opération |
| `UPDATE ... SET statut_actif = false` (conditionnel) | Désactive l'ancienne version **seulement si elle existe** | Gère nativement le cas "première soumission" (aucune ancienne version, `v_ancienne.id IS NULL`, ce bloc est sauté) sans branche de code séparée |
| `INSERT ... RETURNING * INTO v_nouvelle` | Crée la nouvelle version, `numero_version = COALESCE(ancien,0)+1`, `remplace_version_id = ancien id ou NULL` | Chaîne de version correcte dans les deux cas (première soumission ou resoumission) |
| `RETURN v_nouvelle` | Renvoie la ligne créée à la route appelante | Toute exception levée avant ce point (contrainte violée, vérification défensive échouée) annule **automatiquement** toute la transaction — propriété native PostgreSQL, aucune logique de rollback manuelle à écrire ou à tester séparément |
| `REVOKE ALL ... FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE ... TO service_role` | Seule la route Next.js (via la clé `service_role`, jamais exposée au navigateur) peut appeler cette fonction | Cohérent avec 100% des autres tables sensibles du projet (Lot 2.1 section 3) |

### Ce que la fonction ne fait PAS (limites assumées, pas des oublis)

- **Elle ne vérifie pas `documents_institutionnels.write`** (le rôle exact
  du membre) — ce contrôle reste dans `lib/institutionPermissions.ts`, côté
  route, avant l'appel. La fonction ne fait que confirmer l'appartenance du
  membre à l'institution, pas son niveau d'autorisation métier précis.
  **Décision assumée** : dupliquer toute la matrice de permission dans une
  fonction SQL romprait la source unique déjà établie
  (`lib/institutionPermissions.ts`) — la fonction reste minimale, comme
  exigé par le CEO (item 2).
- **Elle ne valide pas le type MIME/la taille du fichier** — ce contrôle
  reste côté route (`MAX_DOCUMENT_SIZE`, `DOCUMENT_ACCEPTED_MIME`,
  `lib/documentsInstitution.ts`), avant l'upload Storage qui précède
  l'appel RPC (section 3).
- **Elle ne vérifie pas que `p_type` fait partie de `getRequiredDocuments()`
  pour le `statut_juridique` de l'institution** — même raisonnement, déjà
  fait côté route.
- **Elle ne bloque pas une resoumission sur un document `valide`** — la
  règle métier actuelle (resoumission autorisée seulement si `statut ∈
  {rejete, complement_demande}`) reste un contrôle de **route**, pas de la
  fonction. La fonction garantit uniquement l'atomicité de l'opération
  *une fois qu'elle a été autorisée* — séparation délibérée entre
  mécanisme (RPC) et politique (route), qui laisse ouverte, sans y répondre
  ici, une future politique de renouvellement après expiration (hors
  périmètre Lot 2.3, cf. `YELEN_TRUST_DATA_AUDIT.md` section 7).

### Question de durcissement supplémentaire (non tranchée, proposée à la décision CEO pour le Lot 2.4)

Aujourd'hui, `service_role` a par défaut un accès direct complet à toutes
les tables (c'est le modèle Supabase standard, déjà documenté
systémiquement au Lot 2.1 GAP-06-08). Rien n'empêche donc, **au niveau
base de données**, qu'un futur bout de code écrive directement dans
`documents_institution` via `.update()`/`.insert()` en contournant
totalement la fonction RPC — la garantie d'atomicité de ce lot ne vaut que
pour le code qui *choisit* de passer par elle, pas une garantie structurelle
absolue.

**Option de durcissement plus stricte (non retenue par défaut, à
trancher)** : révoquer `INSERT`/`UPDATE` sur `documents_institution` pour
`service_role` lui-même, et ne les accorder qu'au rôle propriétaire de la
fonction — rendant la fonction RPC **la seule voie d'écriture possible**,
y compris pour du code futur. C'est une rupture avec le modèle standard
Supabase utilisé partout ailleurs dans ce projet (`service_role` = accès
complet par convention), donc une décision à part, pas une extension
automatique de ce lot. **Recommandation de ce document** : ne pas
l'implémenter maintenant (ajouterait de la complexité pour un risque
aujourd'hui uniquement théorique — un seul point d'écriture existe et
existera après ce lot), mais le documenter comme option disponible si un
jour un deuxième point d'écriture apparaît sans passer par la fonction —
signal d'alerte à surveiller en revue de code plutôt qu'un mécanisme à
construire par anticipation.

---

## 2. Trigger d'immuabilité partielle — relecture ligne par ligne

Trigger défini section D de `YELEN_TRUST_VERIFICATION_DATA_MODEL.md` :
`documents_institution_interdire_falsification()`, `BEFORE UPDATE`.

### Démonstration — quelles mutations sont autorisées

| Colonne | Peut changer ? | Condition exacte dans le trigger |
|---|---|---|
| `institution_id`, `type`, `numero_version`, `soumis_le`, `storage_path`, `hash_integrite`, `soumis_par_membre_id`, `remplace_version_id` | **Jamais** | Bloc `IF NEW.x IS DISTINCT FROM OLD.x ... RAISE EXCEPTION` — les 8 colonnes qui définissent "ce qui a été soumis, par qui, quand, où" sont figées dès l'insertion |
| `statut_actif` | `true → false` uniquement | `IF OLD.statut_actif = false AND NEW.statut_actif = true THEN RAISE EXCEPTION` — le sens inverse est explicitement interdit, `false → true` ne peut donc **jamais** se reproduire même par erreur applicative |
| `statut`, `motif_rejet`, `examine_le`, `examine_par` | Une fois, uniquement depuis `statut='recu'` | `IF OLD.statut <> 'recu' AND NEW.statut IS DISTINCT FROM OLD.statut THEN RAISE EXCEPTION` — bloque toute deuxième décision sur la même ligne ; **note de lecture attentive** : ce garde ne contraint que la colonne `statut` elle-même, pas `motif_rejet`/`examine_le`/`examine_par` indépendamment — voir tentative de contournement ci-dessous |
| Échappatoire | `SET LOCAL app.autoriser_correction_documents_institution = 'on'` | Retourne `NEW` sans aucune vérification — **transactionnelle**, ne persiste jamais au-delà du `COMMIT`, identique au patron `journal_activite`/`signalement_events` déjà éprouvé |
| `DELETE` | **Toujours bloqué** | Le trigger tel que rédigé au Lot 2.2 ne couvre que `BEFORE UPDATE` — **écart trouvé pendant cette relecture** : le texte de la section D dit "DELETE reste bloqué sans exception" mais la définition SQL ne déclare que `BEFORE UPDATE`, pas `BEFORE UPDATE OR DELETE`. **Corrigé ci-dessous.** |

### Correction trouvée pendant la relecture (Lot 2.3)

Le trigger tel que rédigé au Lot 2.2 ne bloque **pas** réellement `DELETE`
— seul le commentaire l'affirmait, la clause `CREATE TRIGGER` n'était pas
incluse dans le bloc SQL du Lot 2.2 et la fonction ne gère que le cas
`UPDATE` (`OLD`/`NEW` tous deux définis). Exactement le type d'erreur que
la consigne CEO ("aucun trigger ne doit être considéré sûr simplement parce
que les tests nominaux passent") anticipe. Correction :

```sql
-- Illustratif — non exécuté.
CREATE OR REPLACE FUNCTION documents_institution_interdire_falsification()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('app.autoriser_correction_documents_institution', true) = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'documents_institution: suppression interdite, aucune version n''est jamais supprimée (id=%)', OLD.id;
  END IF;

  -- TG_OP = 'UPDATE' à partir d'ici
  IF NEW.institution_id  IS DISTINCT FROM OLD.institution_id
     OR NEW.type          IS DISTINCT FROM OLD.type
     OR NEW.numero_version IS DISTINCT FROM OLD.numero_version
     OR NEW.soumis_le     IS DISTINCT FROM OLD.soumis_le
     OR NEW.storage_path  IS DISTINCT FROM OLD.storage_path
     OR NEW.hash_integrite IS DISTINCT FROM OLD.hash_integrite
     OR NEW.soumis_par_membre_id IS DISTINCT FROM OLD.soumis_par_membre_id
     OR NEW.remplace_version_id IS DISTINCT FROM OLD.remplace_version_id
  THEN
    RAISE EXCEPTION 'documents_institution: cette version est figée (id=%)', OLD.id;
  END IF;

  IF OLD.statut_actif = false AND NEW.statut_actif = true THEN
    RAISE EXCEPTION 'documents_institution: statut_actif ne peut jamais repasser à true (id=%)', OLD.id;
  END IF;

  IF OLD.statut <> 'recu' AND (
       NEW.statut IS DISTINCT FROM OLD.statut
    OR NEW.motif_rejet IS DISTINCT FROM OLD.motif_rejet
    OR NEW.examine_le IS DISTINCT FROM OLD.examine_le
    OR NEW.examine_par IS DISTINCT FROM OLD.examine_par
  ) THEN
    RAISE EXCEPTION 'documents_institution: décision déjà prise, immuable (id=%)', OLD.id;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER documents_institution_immuable_partiel
  BEFORE UPDATE OR DELETE ON documents_institution
  FOR EACH ROW EXECUTE FUNCTION documents_institution_interdire_falsification();
```

**Deuxième correction apportée pendant cette relecture** : le garde sur
`statut` du Lot 2.2 ne bloquait que `NEW.statut IS DISTINCT FROM OLD.statut`
— une fois `statut` passé à `'valide'` par exemple, rien n'empêchait un
`UPDATE` qui laisserait `statut` inchangé mais modifierait `motif_rejet`
ou `examine_par` séparément (falsifier l'examinateur après coup sans
toucher au statut). Le bloc ci-dessus étend le garde aux 4 colonnes de
décision ensemble, dès que `OLD.statut <> 'recu'`.

### Démonstration — mutations interdites, avec preuve par l'absurde

| Tentative | Résultat attendu | Ligne du trigger qui le bloque |
|---|---|---|
| `UPDATE documents_institution SET soumis_le = now() WHERE id = X` (falsifier la date de dépôt) | `EXCEPTION` | Bloc de comparaison des 8 colonnes figées |
| `UPDATE documents_institution SET statut_actif = true WHERE id = <ancienne version déjà désactivée>` | `EXCEPTION` | Garde `false → true` |
| `UPDATE documents_institution SET examine_par = <autre admin> WHERE statut = 'valide'` | `EXCEPTION` | Garde étendu aux 4 colonnes de décision |
| `DELETE FROM documents_institution WHERE id = X` | `EXCEPTION` | `IF TG_OP = 'DELETE'` |
| `UPDATE documents_institution SET statut = 'valide', examine_par = <admin>, examine_le = now() WHERE id = X AND statut = 'recu'` (l'examen légitime) | **Autorisé** | Aucun garde ne s'applique — `OLD.statut = 'recu'`, transition légitime unique |
| Même opération, avec `SET LOCAL app.autoriser_correction_documents_institution = 'on'` avant, sur une ligne déjà décidée | **Autorisé** (échappatoire) | Premier bloc, retourne avant toute vérification — **doit rester un geste manuel exceptionnel et journalisé séparément (SQL Editor, jamais depuis le code applicatif)**, même discipline que les 2 autres tables du projet utilisant ce patron |

---

## 3. Storage — détail d'implémentation

Reprend et précise la section F du modèle de données :

1. **Chemin** : `${institution_id}/${type}/${document_id}.${ext}` —
   `document_id` généré côté route (`crypto.randomUUID()`) **avant**
   l'upload, jamais laissé à la base de données.
2. **Ordre exact** (route Next.js, illustratif) :
   ```ts
   const documentId = crypto.randomUUID();
   const path = `${authInstId}/${type}/${documentId}.${verif.extension}`;
   const { error: uploadError } = await sb.storage
     .from("documents")
     .upload(path, buffer, { upsert: false, contentType: verif.detectedType });
   if (uploadError) return NextResponse.json({ error: "UPLOAD_FAILED" }, { status: 500 });

   const hash = crypto.createHash("sha256").update(buffer).digest("hex");

   const { data: nouvelleVersion, error: rpcError } = await sb.rpc(
     "deposer_nouvelle_version_document",
     {
       p_institution_id: authInstId,
       p_type: type,
       p_nom: file.name,
       p_storage_path: path,
       p_hash_integrite: hash,
       p_soumis_par_membre_id: membre.id, // dérivé de la session, jamais du body
     }
   );
   if (rpcError) {
     // Fichier déjà en Storage mais aucune ligne DB — orphelin mineur,
     // acceptable (section F du modèle), jamais l'inverse.
     return NextResponse.json({ error: "VERSION_CREATION_FAILED" }, { status: 500 });
   }
   ```
   **Extrait illustratif seulement** — ce code n'est pas écrit dans le
   dépôt à ce stade, il sert à documenter précisément l'ordre attendu pour
   le Lot 2.4.
3. **`upsert: false`** — chaque chemin étant unique par construction
   (uuid), un conflit de chemin signalerait un vrai bug (uuid dupliqué,
   collision quasi impossible statistiquement) plutôt qu'un cas normal à
   absorber silencieusement.
4. **`hash_integrite`** — SHA-256 calculé côté serveur sur le buffer déjà
   en mémoire pour la validation MIME existante, aucun coût de lecture
   supplémentaire du fichier.
5. **Fichier jamais physiquement remplacé** — par construction du chemin
   versionné, un ancien objet Storage référencé par une décision historique
   ne peut structurellement jamais être écrasé par un nouvel upload (chemins
   distincts garantis par des uuid distincts), satisfaisant directement
   l'exigence CEO item 3 sans mécanisme de protection supplémentaire
   nécessaire côté Storage lui-même.

---

## 4. Traçabilité du déposant — chaîne d'authentification complète

Exigence CEO (item 4) : `soumis_par_membre_id` doit provenir de l'identité
réellement authentifiée, jamais acceptée depuis le client, avec
vérification que ce membre a réellement l'autorisation d'agir pour cette
institution.

**Chaîne complète (route `POST /api/institution/documents`, déjà en place
aujourd'hui pour `institution_id`, réutilisée à l'identique pour
`membre.id`)** :
1. Le cookie de session institution (JWT custom, `institutionAuth`) est
   vérifié en tout début de route — produit `authInstId` (déjà utilisé
   aujourd'hui) **et** `membre` (l'objet membre déjà résolu par la session,
   utilisé aujourd'hui pour le contrôle `can(membre.role,
   "documents_institutionnels.write")`, ligne existante de la route).
2. `membre.id` est passé à `p_soumis_par_membre_id` — **jamais**
   `req.body.soumis_par_membre_id` ou équivalent (qui n'existe d'ailleurs
   pas dans le payload actuel — aucun changement de surface d'attaque par
   rapport à aujourd'hui, la route n'accepte déjà aucun identifiant de
   membre depuis le client).
3. Défense en profondeur interne à la fonction RPC (section 1) — revérifie
   que `membre.id` appartient bien à `institution_id`, indépendamment de
   la route.

**Aucune nouvelle surface de contournement introduite** — la route
n'exposait déjà aucun moyen pour le client de fournir un `membre_id`
arbitraire ; ce lot ajoute seulement une deuxième vérification (RPC) là où
il n'y en avait qu'une (route) auparavant.

---

## 5. Fichiers de migration — sketch par stade (illustratif, noms provisoires)

Noms de fichiers **provisoires** (le vrai horodatage sera celui du jour
réel d'exécution par Bryan) — présentés pour clarifier la découpe, jamais
créés dans `supabase/migrations/` à ce stade.

- `2026MMJJ000001_verification_expand_colonnes.sql` — `ADD COLUMN` (5
  colonnes), `REVOKE ALL ... FROM PUBLIC, anon, authenticated` sur
  `documents_institution`.
- `2026MMJJ000002_verification_expand_fonction_rpc.sql` — création de
  `deposer_nouvelle_version_document()` (section 1), `REVOKE`/`GRANT`.
- `2026MMJJ000003_verification_expand_tables_decision.sql` — `CREATE
  TABLE verification_decisions`, `verification_decision_preuves`, séquence
  + fonction `verification_decisions_generer_id()`, RLS + REVOKE dès la
  création (section H/I du modèle de données).
- `2026MMJJ000004_verification_switch_contrainte_trigger.sql` — `DROP
  CONSTRAINT` ancienne UNIQUE, `CREATE UNIQUE INDEX` partiel, `CREATE
  TRIGGER documents_institution_immuable_partiel` (section 2, version
  corrigée). **Déployée dans la même release que le code de la route POST
  réécrite** (stade SWITCH, non indépendant — section O du modèle de
  données).
- `2026MMJJ000005_verification_contract_fix_fk_migration_perimee.sql` —
  correction cosmétique du fichier `20260711000005` (`admins`→
  `admin_users`, GAP-06-06), sans ré-exécution nécessaire (la contrainte
  réelle en base est déjà correcte).

Chaque fichier reste dans la responsabilité exclusive de Bryan pour
l'exécution réelle (`supabase/migrations/`, SQL Editor) — cette liste est
un plan, pas un livrable de code.

---

## 6. Plan de test — les 12 scénarios exigés par le CEO

**Rappel honnête** : ce qui suit est un plan d'exécution, pas un rapport de
résultats — aucune migration n'existe encore dans cette session. Chaque
ligne indique la précondition, l'action, l'assertion attendue et la requête
de vérification exacte, pour que Bryan (ou le Lot 2.4) puisse les exécuter
tels quels en environnement de test.

| # | Scénario | Action | Assertion attendue | Vérification |
|---|---|---|---|---|
| 1 | Première soumission | Appel RPC pour un `(institution_id, type)` sans ligne existante | Une ligne créée, `numero_version=1`, `statut_actif=true`, `remplace_version_id=NULL` | `SELECT numero_version, statut_actif, remplace_version_id FROM documents_institution WHERE institution_id=X AND type=Y;` |
| 2 | Remplacement après rejet | Ligne 1 `statut='rejete'` → nouvel appel RPC | Ligne 1 : `statut_actif=false`, `statut='rejete'` intact. Ligne 2 : `numero_version=2`, `statut_actif=true`, `remplace_version_id=id(ligne 1)` | Même requête que #1, filtrée sur les deux `numero_version` |
| 3 | Remplacement après complément demandé | Identique à #2 avec `statut='complement_demande'` | Identique à #2 | Identique à #2 |
| 4 | Remplacement après validation | Ligne active `statut='valide'` → tentative de nouvel appel | **Doit être bloqué en amont par la route** (règle métier existante, jamais par le RPC lui-même — section 1, "ce que la fonction ne fait pas") — la route doit renvoyer 409 avant même d'appeler la fonction | Vérifier côté route (pas SQL) : le pré-check existant (`statut IN ('recu','valide')` → 409) doit être adapté pour filtrer sur `statut_actif=true` (section L du modèle de données) et continuer de bloquer `valide` |
| 5 | Deux remplacements simultanés | Deux appels RPC concurrents (deux transactions ouvertes en parallèle) pour le même `(institution_id, type)` | La deuxième transaction attend la libération du verrou consultatif puis s'exécute sur l'état déjà mis à jour par la première — **aucune des deux ne doit échouer silencieusement, aucune duplication de ligne active** | `SELECT count(*) FROM documents_institution WHERE institution_id=X AND type=Y AND statut_actif; ` → doit toujours renvoyer `1` après les deux transactions |
| 6 | Upload Storage simultané | Deux appels concurrents complets (upload + RPC) | Deux fichiers distincts créés (chemins distincts par construction, section 3) — pas de collision possible, contrairement à l'ancien chemin fixe | Lister le contenu du bucket au chemin `${institution_id}/${type}/` après le test — doit contenir exactement 2 objets |
| 7 | Modification d'une preuve historique | `UPDATE documents_institution SET soumis_le = now() WHERE statut <> 'recu'` sans échappatoire | `EXCEPTION` levée | Doit échouer — vérifier le message d'erreur exact du trigger |
| 8 | Suppression | `DELETE FROM documents_institution WHERE id = X` | `EXCEPTION` levée (section 2, correction du `TG_OP='DELETE'`) | Idem — confirme la correction trouvée pendant la relecture de ce lot |
| 9 | Falsification de `soumis_par_membre_id` | Appel RPC avec un `p_soumis_par_membre_id` appartenant à une **autre** institution que `p_institution_id` | `EXCEPTION` (défense en profondeur, section 1) | Doit échouer avant toute écriture — vérifier qu'aucune ligne n'a été créée (`SELECT count(*)` inchangé) |
| 10 | Décision sur V1 puis remplacement par V2 | Décision `verification_decisions`/`verification_decision_preuves` créée référençant V1 (`statut_actif=true` à ce moment) → institution soumet V2 ensuite | `verification_decision_preuves` de la décision d'origine garde `statut_snapshot`/`storage_path_snapshot` de V1 **intacts**, indépendamment du fait que V1 soit maintenant `statut_actif=false` | `SELECT statut_snapshot, storage_path_snapshot FROM verification_decision_preuves WHERE document_institution_id = <id V1>;` — doit rester identique avant/après la création de V2 |
| 11 | Reconstruction historique de D1 | Requête de reconstruction complète (ci-dessous) | Répond à "pourquoi Yelen considérait cette organisation comme vérifiée à cette date" avec uniquement les données persistées, sans dépendre de l'état courant de `documents_institution` | Voir requête ci-dessous — **c'est la preuve directe de la "règle fondamentale" (item 7 du CEO)** |
| 12 | Rollback transactionnel | Forcer une exception au milieu du RPC (ex. lever une exception juste après le `UPDATE` de désactivation, avant l'`INSERT`) | **Aucune moitié d'opération ne persiste** — la ligne ancienne reste `statut_actif=true` après le `ROLLBACK` (pas de désactivation orpheline) | `SELECT statut_actif FROM documents_institution WHERE id = <ancienne ligne>;` doit valoir `true` après l'échec forcé |

### Requête de reconstruction (test 11 — artefact concret, pas seulement une intention)

```sql
-- Illustratif — non exécuté. Répond exactement à la "règle fondamentale"
-- (item 7 du CEO) avec uniquement les données persistées.
SELECT
  vd.decision_id, vd.axe, vd.type_decision, vd.niveau_preuve,
  vd.examinateur_nom, vd.decide_le, vd.justification, vd.expire_le,
  vdp.type_snapshot, vdp.numero_version_snapshot, vdp.statut_snapshot,
  vdp.storage_path_snapshot, vdp.hash_integrite_snapshot,
  vdp.soumis_le_snapshot, vdp.examine_le_snapshot, vdp.examine_par_nom_snapshot
FROM verification_decisions vd
JOIN verification_decision_preuves vdp ON vdp.decision_id = vd.id
WHERE vd.decision_id = 'YL-VER-2026-00000001'
ORDER BY vdp.type_snapshot;
```

Chaque colonne de la liste "règle fondamentale" du CEO (quelle preuve,
quelle version, quel hash, quel examen, quel examinateur, quelle décision,
quelle justification, quelle date, quel axe, quelle expiration) apparaît
dans cette seule requête, sans aucun `JOIN` vers l'état courant de
`documents_institution` — la reconstruction ne dépend donc jamais de ce que
devient la table source ensuite, exactement l'exigence posée.

---

## 7. Rapport de risques résiduels

Après cette relecture (section 2 en particulier), les risques du modèle de
données (section N de `YELEN_TRUST_VERIFICATION_DATA_MODEL.md`) sont
affinés :

- **Corrigé pendant ce lot, pas seulement identifié** : le trigger du Lot
  2.2 ne bloquait pas réellement `DELETE`, et laissait une fenêtre pour
  modifier `motif_rejet`/`examine_le`/`examine_par` indépendamment de
  `statut` une fois la décision prise. Les deux corrigés section 2 — la
  preuve que "les tests nominaux passent" ne suffit pas était donc fondée,
  cette relecture en a trouvé un exemple concret avant toute exécution
  réelle.
- **Résiduel, assumé, pas corrigé** : `service_role` garde un accès direct
  aux tables même après ce lot (section 1, "question de durcissement non
  tranchée") — la garantie d'atomicité tient tant que le code applicatif
  respecte la discipline de passer par la fonction RPC, pas par une
  contrainte absolue de la base. À surveiller en revue de code future.
- **Résiduel, faible impact** : collision de hash sur le verrou consultatif
  (`pg_advisory_xact_lock`) — dégrade la latence dans un cas improbable,
  jamais la correction (section N du modèle de données, inchangé).
- **Bloquant opérationnel, hors du périmètre code** : bucket Storage
  `documents` toujours non confirmé créé — aucun des 12 tests ne peut
  s'exécuter réellement avant que Bryan confirme/crée ce bucket.
- **Non testable dans cette session** : tous les 12 scénarios ci-dessus
  sont un plan, pas des résultats — leur exécution réelle nécessite le
  code du Lot 2.4 et un environnement Supabase réel (idéalement un projet
  de test distinct de la production, à confirmer avec Bryan).

---

## 8. GO / NO-GO pour le Lot 2.4

**GO conditionnel**, plus resserré qu'au Lot 2.2 grâce à cette relecture :

1. La fonction RPC et le trigger sont maintenant spécifiés à un niveau
   d'implémentation réel (pas seulement conceptuel) — la correction trouvée
   section 2 confirme la valeur de cette étape de relecture avant tout code.
2. Le plan de test des 12 scénarios est prêt à être exécuté dès que le code
   du Lot 2.4 existe — aucun scénario laissé sans requête de vérification
   précise.
3. **Restent bloquants avant migration réelle** : confirmation par Bryan de
   l'état du bucket `documents` (section 5, inventaire déjà décrit dans le
   modèle de données section J), et décision explicite sur la question de
   durcissement de la section 1 (`service_role` accès direct — à trancher
   ou à assumer explicitement comme risque résiduel, pas à ignorer).
4. Le Lot 2.4 doit produire le code réel (routes, migrations) suivi de
   l'exécution effective des 12 tests par Bryan dans un environnement de
   test — ce lot ne prétend à aucun moment que ces tests ont été exécutés.

Arrêt obligatoire à la fin du Lot 2.3, conformément à la consigne CEO.
Aucun code, migration, changement Supabase, ou commit dans ce lot.
