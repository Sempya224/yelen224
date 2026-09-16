# Yelen — Restriction automatique des rendez-vous (no-show) + fiche RDV

Chantier du **03/09/2026** (décision CEO), documenté a posteriori le
06/09/2026 — code et migrations déjà écrits mais **jamais commités**,
absents de `CLAUDE.md` et de `docs/` jusqu'à cette fiche. Deux chantiers
connexes de la même semaine (QR à double expiration, fiche RDV) sont
regroupés en fin de document plutôt que dupliqués dans un fichier séparé.

## 1. Objectif produit

Sanctionner progressivement les rendez-vous non honorés ("Absent"), **sans
jamais bloquer le compte citoyen dans son ensemble** — seule la
fonctionnalité rendez-vous/réservation est concernée. Décision explicite du
brief : "jamais un blocage global du compte citoyen".

Paliers, basés sur le nombre total de RDV `presence_status='absent'` :
- **3 absences** → restriction de réservation **7 jours**
- **5 absences** → restriction de réservation **30 jours**
- **10 absences** → **clôture définitive** de l'accès aux rendez-vous, seule
  issue : "Faire appel"

Le report et l'annulation d'un RDV **ne comptent jamais** comme absence
(`reporterRdv` modifie la ligne en place, `annulerRdv` passe `statut='annule'`
— `presence_status` reste inchangé dans les deux cas).

## 2. Modèle de données

Migration : `supabase/migrations/20260903000001_citoyen_rdv_restrictions.sql`.
Architecture calquée sur "Espace suspendu v2" institution
(`20260817000001_institution_suspensions_revisions.sql`) : table événement
insert-only + statut `active`/`levee` + système d'appel + auto-réactivation
cron.

### `citoyen_rdv_restrictions`
Une ligne par escalade réellement appliquée. `reference` (`RES-{année}-{8
chiffres}`), `niveau` (`restreint_7j`/`restreint_30j`/`clos`),
`absences_total` (snapshot au moment du trigger, jamais recalculé),
`jusqu_au` (NULL si `clos`), `statut` (`active`/`levee`), `levee_par`
(`auto`/`revision`), `levee_admin_id`. RLS activé, **zéro policy** — accès
exclusivement `service_role` (comme `institution_suspensions`), le citoyen
ne lit jamais cette table directement, uniquement via
`GET /api/citoyen/rdv-restriction`.

### `citoyen_rdv_appels`
"Faire appel" — **disponible uniquement quand `niveau='clos'`** (jamais pour
7j/30j : décision produit explicite, la contestation ne concerne que la
clôture définitive). `reference` (`APL-{année}-{8 chiffres}`), `statut`
(`en_attente`/`acceptee`/`rejetee`). Index unique partiel
(`citoyen_rdv_appels_one_open_idx`, `WHERE statut='en_attente'`) imposant
en base la règle "pas de double demande" — même principe que
`institution_suspension_revisions_one_open_idx`.

### Trigger `citoyen_rdv_evaluer_restriction` — point de calcul UNIQUE
`AFTER UPDATE OF presence_status ON rdv`, déclenché quand
`presence_status` passe à `'absent'`. C'est le **seul** endroit qui calcule
les seuils — ni `rdv/statut/route.ts` ni `paid-bookings/valider/route.ts` ne
dupliquent cette logique, les deux se contentent d'écrire
`presence_status='absent'` comme aujourd'hui. Choix explicite pour éviter le
drift déjà rencontré une fois sur `institutions.moyenne_avis` (calcul
applicatif oublié à un endroit).

Point important du calcul : un **checkpoint** (`levee_le` du dernier appel
accepté par un admin sur une clôture de ce citoyen) borne le comptage — les
absences antérieures à un appel accepté ne comptent plus pour de futures
escalades. Sans ça, une absence après un appel accepté referait clôturer le
compte immédiatement, ce qui viderait l'appel de son sens. Le trigger
compare aussi le **palier le plus sévère jamais atteint depuis ce
checkpoint** (pas seulement la restriction actuellement active), pour
qu'une restriction 7j déjà auto-réactivée ne soit jamais réappliquée par une
4ᵉ absence isolée.

### Verrou backend réel (défense en profondeur)
Policies RLS `rdv_citoyen_insert` et `paid_bookings_citoyen_insert`
réécrites pour rejeter tout `INSERT` si une restriction `statut='active'`
existe pour ce citoyen — couvre les deux chemins d'écriture existants
(`createRdv` en server action, **et** l'insert direct navigateur du flux
payant qui ne passe par aucune fonction serveur commune).

### Cron auto-réactivation
`pg_cron` (`5 * * * *`) + `pg_net`, même mécanisme que
`institution-suspension-autoreactivate` (secret Vault `service_role_key`,
déjà créé). **⚠️ Étape manuelle obligatoire, jamais faite par Claude Code** :
```
supabase functions deploy citoyen-rdv-restriction-autoreactivate
```
Sans ce déploiement, le schedule pg_cron échoue silencieusement. Fonction :
`supabase/functions/citoyen-rdv-restriction-autoreactivate/index.ts` — ne
touche que les restrictions temporaires (`jusqu_au` dépassé), jamais
`niveau='clos'` (seule une décision d'appel acceptée par un admin peut lever
une clôture).

## 3. Backend applicatif

`lib/rdvRestrictions.ts` — **miroir de lecture uniquement**, ne recalcule
jamais les seuils (`RDV_ABSENCE_SEUILS` n'est qu'un affichage) :
- `chargerRestrictionActive(sb, citoyenId)` — restriction active, réutilisée
  par la route citoyen et par le check amont dans `createRdv`.
- `notifierSiEscalade(sb, citoyenId, restrictionAvantId)` — pont entre le
  trigger SQL (seul décideur) et le moteur de notifications TS : compare
  l'id de restriction active avant/après un `UPDATE presence_status`, notifie
  seulement si le trigger vient d'escalader. Appelé depuis
  `app/api/institution/rdv/statut/route.ts` et
  `app/api/institution/paid-bookings/valider/route.ts` (les 2 seuls
  endroits qui écrivent `presence_status='absent'`).

## 4. Routes API

**Citoyen** (auth `verifierCitoyenToken`) :
- `GET /api/citoyen/rdv-restriction` — restriction active + RDV concernés
  (filtrés par le même checkpoint que le trigger, jamais tout l'historique)
  + état de l'appel en cours/traité.
- `POST /api/citoyen/rdv-restriction/appel` — soumission "Faire appel"
  (message ≥10 caractères), rejette si pas de clôture active ou déjà une
  demande `en_attente` (double filet : vérif applicative + `23505` sur
  l'index unique).

**Admin** (permission `citoyens.rdv_restrictions`, rôles
`super_admin`/`moderateur`/`admin`) :
- `GET /api/admin/rdv-restrictions?filtre=...` — liste des restrictions
  (tous/7j/30j/clos) ou des appels (`filtre=appels`).
- `PATCH /api/admin/rdv-restrictions/appel` — `accepter` (lève la
  restriction, `levee_par='revision'`, notifie) ou `rejeter` (motif
  obligatoire, notifie). Log `admin_logs` (`RDV_APPEL_ACCEPTE`/`_REJETE`).

## 5. UI

**Citoyen** — `components/RdvRestrictionScreen.tsx`, wiré dans
`app/rdv/[id]/page.tsx` (import ligne 36, montage ligne 836). Plein écran,
même gabarit que le reste de ce dossier (position fixed, header sticky, X
carré, accent `#F5A623` uniquement — jamais de fond héros noir, voir
[[feedback_no_black_hero_backgrounds]]). Deux gabarits dans le même
composant :
- `restreint_7j`/`restreint_30j` : X visible, décompte, date de
  réactivation, historique des RDV absents concernés.
- `clos` : aucun X, uniquement "Faire appel" (formulaire + statut de la
  demande en cours/rejetée avec motif).

**Admin** — `app/admin/rdv-restrictions/page.tsx` (nav : "Restrictions RDV",
`app/admin/layout.tsx:46`). Structure calquée sur
`app/admin/revisions/page.tsx` : filtres, cartes, `ConfirmModal` pour
accepter/rejeter un appel.

## 6. État réel / reste à faire

- **Code complet (backend + UI citoyen + UI admin), migration écrite,
  jamais exécutée en base ni commitée.**
- Bloquant avant toute exécution : déploiement de la fonction Edge
  (section 2) — sans lui, le cron échoue silencieusement.
- Aucun test réel (SQL ou navigateur) documenté à ce jour — contrairement à
  la discipline `VERIFIED IN DATABASE`/`IN APPLICATION` appliquée sur le
  chantier Trust (voir `docs/product/YELEN_TRUST_VERIFICATION_*`), ce
  chantier n'a pas encore reçu ce traitement.
- Pas de vérification que `envoyerNotification`/`notifierSiEscalade` sont
  bien appelés aux 2 endroits attendus après cette doc — à confirmer par
  Bryan si ce chantier est repris.

---

## 7. Chantier connexe — Suspension automatique institution (RDV non traités, 15/09/2026)

Brief Bryan, même session que le correctif de réservation atomique
(GAP-08-04/GAP-09-02). **Différent du système ci-dessus** : ne concerne
pas les citoyens/absences, mais les institutions qui laissent des RDV
sans réponse. Paliers demandés, calqués sur les mêmes seuils 3/5/10 mais
avec une durée mesurée sur **30 jours glissants** (pas à vie comme le
modèle citoyen) :
- **3 RDV non traités / 30 jours** → suspension **7 jours**
- **5 RDV non traités / 30 jours** → suspension **30 jours**
- **10 RDV non traités / 30 jours** → suspension **indéfinie** (jusqu'à
  révision admin)

### Décision d'architecture : réutiliser, pas dupliquer

Bryan a dit **"compte bloqué"**, pas "réservations bloquées" — contraste
volontaire avec le modèle citoyen ci-dessus (§1, "jamais un blocage
global du compte citoyen"). "Compte bloqué" correspond exactement au
mécanisme **déjà en production** "Espace suspendu v2"
(`institution_suspensions`/`institution_suspension_revisions`, migration
`20260817000001`, décision CEO 17/08/2026) : `institutions.statut =
'suspendue'`, écran `CompteSuspenduScreen` (vérifié : bloque bien
l'essentiel du dashboard, quelques onglets `Communication`/`Paramètres`
restent accessibles), système de révision/appel déjà construit
(`app/api/institution/suspension/revision`,
`app/api/admin/suspension-revisions`), et **réactivation automatique déjà
déployée** (`supabase/functions/institution-suspension-autoreactivate`,
cron horaire).

Conséquence directe de cette réutilisation : seule la **détection** est
nouvelle dans ce chantier. Révision/appel et réactivation temporisée
fonctionnent sur ces nouvelles suspensions sans une seule ligne de code
supplémentaire.

### Différence structurelle avec le modèle citoyen : pas d'événement discret

`presence_status='absent'` est un événement d'écriture explicite
(déclenche un trigger `AFTER UPDATE`). "Non traité"
(`lib/rdvGating.ts::rdvNonTraite()`) est un état qui apparaît par simple
écoulement du temps (30 min de grâce après l'heure prévue, RDV toujours
`nouveau`/`en_attente` non absent) — aucun `UPDATE` ne se produit au
moment exact de la bascule, donc aucun trigger row-level possible.

Résolu par un job périodique (`pg_cron`, `*/15 * * * *`, même cadence que
`clock-in-daily-attendance`) :
1. `institution_rdv_marquer_et_evaluer()` marque, **une seule fois, de
   façon permanente**, les RDV qui viennent de franchir le seuil
   (`rdv.non_traite_marque_le`, nouvelle colonne nullable) — même
   principe que `presence_status='absent'` : un RDV traité tardivement
   continue de compter dans l'historique de l'institution, jamais
   "effacé" rétroactivement.
2. Pour chaque institution ayant un RDV fraîchement marqué (fenêtre de 20
   min, marge de sécurité sur la cadence de 15 min du cron),
   `institution_rdv_evaluer_restriction(institution_id)` recompte sur
   une **fenêtre glissante de 30 jours** (pas à vie, différence
   explicite avec le modèle citoyen) et escalade si nécessaire — même
   structure de calcul que `citoyen_rdv_evaluer_restriction` (checkpoint
   sur dernière révision acceptée, palier le plus sévère déjà atteint
   depuis ce checkpoint).

**Aucune fonction Edge à déployer** (contrairement à
`citoyen-rdv-restriction-autoreactivate`) : marquage et évaluation sont
en SQL pur (`SELECT`/`UPDATE`/`INSERT` directs), pas de notification push
temps réel dans cette version (insert direct dans `notifications`, lu au
prochain chargement du dashboard institution).

### Nouvelle colonne `institution_suspensions.origine`

`'admin' | 'auto_rdv_non_traites'`, défaut `'admin'` (toutes les
suspensions déjà existantes restent inchangées). Nécessaire pour tracer
l'escalade (palier déjà atteint) sans jamais qu'une suspension manuelle
admin, sans rapport, influence ce calcul — et pour ne jamais lever une
suspension admin par erreur lors d'une ré-escalade automatique. Garde-fou
supplémentaire : si une suspension active existe déjà (de n'importe
quelle origine) au moment d'escalader, aucune seconde ligne active n'est
insérée — la décision admin prévaut toujours.

### État réel

Migration `20260915000003_institution_rdv_non_traites_suspension.sql`
**exécutée avec succès par Bryan le 15/09/2026** (job cron créé, id 13).

**VERIFIED IN APPLICATION (15/09/2026)** — confirmé en conditions
réelles par Bryan sur une institution réelle (ECOBNAKGN) : dashboard
affichant `CompteSuspenduScreen`, motif exact généré par
`institution_rdv_evaluer_restriction()` ("5 rendez-vous non traités (ni
confirmés, ni refusés, ni marqués absents dans les 30 minutes suivant
l'heure prévue) au cours des 30 derniers jours"), panneau "Demander une
révision" opérationnel — confirme que la réutilisation du mécanisme
"Espace suspendu v2" fonctionne de bout en bout sans code
supplémentaire, exactement comme conçu.

**Bug réel trouvé en testant (15/09/2026, même soir)** : une fois
l'institution ECOBNAKGN suspendue par ce mécanisme, Bryan a pu quand même
cliquer "Accepter" sur un RDV déjà existant et l'action a réussi — rien
ne vérifiait `institutions.statut` dans les routes qui traitent les
actions RDV, seul le tab-gating de `app/[slug]/[id]/layout.tsx`
(`ALLOWED_TABS_SUSPENDU`) limitait l'UI principale, contournable via un
raccourci (widget calendrier). Corrigé le même soir dans 3 routes
(`app/api/institution/rdv/statut/route.ts`,
`app/api/institution/paid-bookings/valider/route.ts`,
`app/api/qr/validate/route.ts` POST+PUT) — chacune vérifie désormais
`institutions.statut` juste après l'authentification/autorisation de
rôle, rejette avec un message humanisé (403) si `suspendue`. `tsc`
propre. **Non commité, non testé en conditions réelles** (il faudrait
re-suspendre une institution puis retenter "Accepter" pour confirmer le
blocage).

### Chantier citoyen — annulation proactive d'un RDV imminent (15/09/2026, même soir)

Stratégie validée par Bryan après réflexion explicite "comment gérer côté
citoyen sans le frustrer et sans qu'il sache que l'établissement a été
suspendu" — approche "US" façon DoorDash face à une commande qui ne peut
pas être honorée : s'excuser clairement, ne jamais blâmer le client, ne
jamais s'attarder sur la cause interne, proposer une solution immédiate.
**Le mot "suspendu"/"suspension" n'apparaît jamais dans un message
citoyen.**

**Décision de fond** : le silence est plus risqué qu'une communication
neutre mais honnête. Mais la plupart des suspensions (7j/30j) se lèvent
avant la date du rendez-vous — il ne faut donc rien dire tant que ce
n'est pas nécessaire. Seuls les RDV **imminents** (fenêtre de 48h)
d'une institution encore suspendue sont concernés.

**Mécanisme** (migration
`20260915000004_rdv_annulation_systeme_institution_suspendue.sql`, cron
`*/15 * * * *`, même cadence que le reste) :
- Trouve les RDV `nouveau`/`en_attente` d'une institution `suspendue`
  dont l'heure prévue tombe dans les 48h à venir.
- Annule le RDV (`statut='annule'`, `motif_annulation` = message humain)
  et sa réservation payante jumelle éventuelle (`paid_bookings.statut='annule'`
  — jamais `'rembourse'`, aucun paiement réel n'a transité par Yelen tant
  que le statut restait `en_attente`, modèle "paiement sur place").
- Trace l'événement dans `rdv_events` avec `auteur_type='system'` (valeur
  déjà prévue par l'enum `auteur_type_rdv_event` depuis l'origine,
  migration `20260709000012`).
- Insère une notification citoyen (`type='rdv_annule_systeme'`) avec un
  message ton DoorDash : excuse + action immédiate, jamais de cause.

**CTA** : `lib/notificationContent.ts::resoudreCta()` étendue — cas
spécial `type==='rdv_annule_systeme'` vérifié avant la règle générique
par FK (qui aurait produit "Voir la conversation", incohérent sur un RDV
annulé) → `{ label: "Trouver un établissement disponible", href:
"/recherche" }`. Pas de second CTA dédié "Contacter le support" — le
message texte y invite déjà, cohérent avec le reste du produit (le
support reste accessible en permanence via l'icône casque, jamais un
bouton par notification) et avec le pattern réel DoorDash (un seul CTA
dominant par notification, pas deux boutons concurrents).

**Historique citoyen** (`app/mes-rdv/page.tsx`) : la timeline détail
distinguait déjà "Vous avez annulé"/"{institution} a annulé" — un
troisième cas explicite ajouté pour `auteur_type==='system'` → "Rendez-
vous annulé automatiquement" (neutre, jamais la cause).

**Limite assumée et documentée, pas une régression de ce soir** :
notification **in-app uniquement**, pas de vraie push envoyée — même
contrainte déjà acceptée sur le système de rappels RDV en production
(`supabase/functions/rappels-rdv`) : une fonction déclenchée par
`pg_cron` ne peut pas appeler `web-push` (Node uniquement, pas
Deno/SQL). Corriger ce point demanderait de faire transiter l'envoi par
une route Next.js, hors périmètre de ce soir.

**État réel** : migration **exécutée avec succès par Bryan le
15/09/2026** (job cron id 14).

**VERIFIED IN DATABASE (15/09/2026)** — testé en conditions réelles sur
un RDV de test (avancé artificiellement de ~2h dans le futur, compte
citoyen de test `8f71718d-...@citoyen.yelen224.local`, institution
ECOBNAKGN déjà suspendue) : `SELECT institution_rdv_annuler_si_imminent_et_suspendue();`
a correctement (1) mis `rdv.statut='annule'` avec le message humanisé
exact, (2) inséré la ligne `rdv_events` attendue
(`auteur_type='system'`, `action='annulation'`, `ancien_statut='en_attente'`
→ `nouveau_statut='annule'`), (3) créé la notification citoyen
(`type='rdv_annule_systeme'`, message complet avec l'invitation à
retrouver un établissement + contacter le support, **aucune mention de
"suspension"**). Chaîne complète confirmée fonctionnelle en base — reste
uniquement à confirmer visuellement l'affichage dans "Mes RDV"
("Rendez-vous annulé automatiquement") et le panneau de notifications
(CTA "Trouver un établissement disponible") côté navigateur.

**Corrections suite à des tests réels supplémentaires (15/09/2026, même
soir)** :
- Bug réel trouvé par Bryan : la version qui retirait la borne `> now()`
  (pour couvrir aussi les RDV déjà passés) écrasait un RDV **déjà
  résolu "non traité"** (accepté puis jamais honoré, affiché "Non
  honoré" au citoyen) en "Annulé par le système" — état déjà établi et
  compréhensible, jamais à réécrire après coup. Principe corrigé : cette
  fonction n'agit **que sur les RDV encore à venir** (`> now()` restauré),
  jamais sur ceux déjà passés en zone "non traité" (qui relèvent
  exclusivement de `institution_rdv_marquer_et_evaluer`). RDV de test
  faussé réparé (`f8294c34-...`, remis à `en_attente`).
- Bug réel trouvé par Bryan : `institutions_public_read` (`USING
  (statut='validee')`) rendait le nom/logo d'une institution suspendue
  invisible même pour un citoyen ayant un vrai historique de RDV avec
  elle (`app/mes-rdv/page.tsx` interroge `institutions` via le client
  navigateur, donc soumis à RLS). Corrigé par une policy RLS **additive**
  (`institutions_read_via_own_rdv`, n'affaiblit jamais la policy
  existante) : lecture autorisée si le citoyen a un `rdv` réel avec
  cette institution, peu importe son statut actuel.
- Libellé citoyen changé : "Rendez-vous annulé automatiquement" →
  "Annulé par le système" (demande Bryan).

**Refonte du ton et de la résolution (brief Bryan détaillé, 15/09/2026,
référence DoorDash "problème → contexte → résolution → assistance")** :
- Titre notification : "Votre rendez-vous" → "Votre rendez-vous a été
  annulé".
- Message : ton plus humain et court ("Nous sommes désolés pour ce
  changement...") au lieu du registre plus administratif ("navrés pour
  la gêne occasionnée").
- CTA principal renommé : "Trouver un établissement disponible" →
  "Trouver un nouveau rendez-vous".
- Nouveau CTA secondaire, discret : "Besoin d'aide ?" → `/messagerie/citoyen`
  (`lib/notificationContent.tsx::resoudreCtaSecondaire()`, nouveau
  registre, vide pour tous les autres types de notification — pas de
  bruit ajouté ailleurs).
- Bouton de fermeture : "Compris" → "Fermer" (changement global du
  composant partagé `NotificationDetailOverlay.tsx`, jugé neutre pour
  tous les types de notification).

**Explicitement pas fait ce soir, hors périmètre, à reprendre dans un
chantier dédié si priorisé** : la carte de contexte séparée
(institution + date/heure + badge "Annulé" dans un encadré distinct du
message), le bouton retour `‹` dans l'en-tête, la section "Que
souhaitez-vous faire ?", et surtout la **variation du message selon la
cause réelle de l'annulation** (institution vs. Yelen vs. incident
technique) — ce dernier point demanderait de modéliser une vraie
"cause" structurée (aujourd'hui, la seule cause existante est la
suspension pour RDV non traités ; généraliser sans données réelles sur
d'autres causes inventerait une distinction qui n'existe pas encore
dans le système).

**Reste à faire, hors périmètre de ce chantier** : aucune UI dédiée
distinguant une suspension "RDV non traités" d'une suspension admin
classique dans `CompteSuspenduScreen`/l'écran de révision (le `motif`
texte suffit aujourd'hui à informer l'institution, mais rien n'affiche
`origine` explicitement) ; aucune notification push temps réel ; aucun
KPI/dashboard admin dédié au suivi de ces suspensions automatiques
spécifiquement (visibles seulement mêlées aux suspensions manuelles dans
`app/admin/revisions/page.tsx` et les listes de suspensions existantes).

---

## 8. Chantiers connexes de la même semaine (RDV)

### QR gratuit à double expiration (01/09/2026)
Migration `20260901000001_rdv_qr_regenere_le.sql` — remplace la
régénération illimitée à expiration 7 jours (sans rapport avec l'heure du
RDV) par un cycle borné :
- Le QR expire **30 min après l'heure du RDV** (`QR_MINUTES_APRES_RDV`,
  `lib/rdvGating.ts`) s'il n'a pas été scanné.
- **Une seule régénération finale** est ensuite autorisée, valable **10
  min** (`QR_MINUTES_REGENERATION_FINALE`).
- `rdv.qr_regenere_le` trace si cette régénération finale a déjà eu lieu —
  une fois posée, plus aucune nouvelle valeur de `qr_expires_at` n'est
  jamais écrite, ce qui suffit à bloquer le scan côté
  `app/api/qr/validate/route.ts` sans logique supplémentaire.
- Implémenté dans `app/api/qr/generate/route.ts` (`calculerEtatQr()`,
  états `aucun`/`actif`/`expire_regenerable`/`expire_definitif`) — état
  `expire_definitif` renvoie un message fixe
  (`RDV_QR_EXPIRE_DEFINITIF_MESSAGE`) sans jamais écrire de ligne.
- Nullable, aucun backfill (les RDV déjà en cours reprennent le nouveau
  cycle dès leur prochaine génération).

### Fiche RDV — `accepte_le` + `reference` (03/09/2026)
Migration `20260903000003_rdv_reference_accepte_le.sql`, pour construire
une fiche "Détail du rendez-vous" citoyen honnête sans donnée inventée :
- `accepte_le` (nullable, **jamais backfillée** — l'instant où l'institution
  a accepté un RDV nouveau→en_attente n'est reconstituable pour aucun RDV
  antérieur à cette migration). Renseignée uniquement par
  `app/api/institution/rdv/statut/route.ts:69` quand `action==='en_attente'`.
- `reference` (`RDV-{année}-{compteur6}`, séquence globale jamais remise à
  zéro — même mécanisme que `transactions_financieres`/`recus`/
  `journal_activite`) — colonne `UNIQUE NOT NULL`, backfillée pour les RDV
  existants au moment de la migration (contrairement à `accepte_le`, une
  référence peut être générée rétroactivement sans mentir sur un fait
  historique).

Ces deux chantiers (QR + fiche RDV) sont indépendants du système de
restriction no-show ci-dessus — regroupés dans ce document uniquement parce
qu'ils touchent la même table `rdv` la même semaine, pas parce qu'ils
partagent un mécanisme.
