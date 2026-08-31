# YELEN224 — Règles UX/UI et audit boutons/confirmations

Document unique qui centralise toutes les règles UX/UI du projet — **CLAUDE.md
ne contient plus de section UX détaillée**, uniquement un pointeur vers ce
fichier (décision du 16/08/2026). Complète `docs/ui/YELEN_UI_REFERENCE.md`
(dimensions de composants adoptées) et `docs/ui/YELEN_UI_DENSITY_AUDIT.md`
(historique des Lots UI) — trois documents distincts, ne pas fusionner :
celui-ci porte sur les **règles de comportement/interaction** (boutons,
confirmations, affordances), les deux autres sur les **dimensions**
(padding, radius, tailles de police).

---

## 1. Règles non négociables (migrées de CLAUDE.md, inchangées)

Établies pendant le chantier de refonte visuelle du dashboard institution,
valables pour tout écran professionnel du produit (institution **et**
admin, sauf mention contraire) :

Public cible : dirigeants d'institutions et équipe Yelen, pas grand public
— police délibérément plus grande/foncée/affirmée (référence : DoorDash).

1. **Zéro emoji, nulle part.** Icônes SVG inline style trait (`stroke`,
   `viewBox 24x24`, `strokeWidth 2`), convention Feather-icons.
2. **Taille de texte minimale fonctionnelle ~12-13px, poids 700-800.** KPI
   gros et gras (20-22px, 900).
3. **Un état "sélectionné" change bordure + texte + fond, jamais le fond
   seul.**
4. **Toute action cliquable doit avoir une affordance visible au repos**
   (fond + bordure), jamais une icône nue révélée au survol seul.
5. **Toute fiche détail/modal s'adapte au desktop** : bottom sheet
   mobile-first, dialogue centré ≥1024px (convention
   `.client-fiche-overlay/panel/grip/close-x`, répliquée par écran :
   `.cis-fiche-*`, `.sig-fiche-*`, `.doc-fiche-*`, `.equipe-fiche-*`,
   `.dispo-*`, `.valider-*`). **Jamais de drawer latéral** — testé une
   fois sur Clock In Shift (Employé/Département), explicitement abandonné
   et revenu à cette convention le 05/08/2026, ne pas rouvrir sans
   nouvelle décision explicite de Bryan.

---

## 2. Constat déclencheur (16/08/2026, Bryan)

> "Le problème actuel est que nous n'avons pas de bouton cohérent sur tous
> les écrans, institution et admin. Et nous n'avons pas de popup qui
> s'affiche quand on veut effectuer une action importante, comme
> Supabase."

Audit exhaustif mené en réponse (méthodologie : lecture intégrale des 34
fichiers `*Tab.tsx` du dashboard institution + des ~20 pages
`app/admin/*/page.tsx`, recherche exhaustive d'un composant `Button`/
`ActionButton`/`ConfirmModal` dans tout le dépôt). **Chaque affirmation
ci-dessous est VERIFIED par lecture directe du code, citée fichier+ligne
dans les rapports d'audit sources — aucune supposition.**

---

## 3. État réel — Dashboard Institution

### 3.1 Boutons

**Aucun composant `Button`/`ActionButton` partagé n'existe.** Recherche
exhaustive (`app/institution/`, `components/`) : seul résultat hors-sujet,
`app/institution/abonnement/submit-button.tsx`, isolé, jamais importé par
le dashboard. **34/34 fichiers `*Tab.tsx` redéfinissent leurs boutons en
`<button style={{...}}>` inline.**

Deux fonctions de style locales existent mais ne sont jamais partagées :
`actionBtnStyle()` (définie **deux fois séparément**, avec un contenu
différent, dans `MesOffresOffreDetail.tsx:34` et `SignalementsTab.tsx:1089`
— même nom, deux implémentations) et `docConfirmBtnStyle()`
(`DocumentsClientsTab.tsx:273`, locale à ce seul fichier).

**Preuve concrète de l'incohérence** — boutons "primaires" (action de
sauvegarde), tous stylés différemment :

| Fichier | background | padding | radius |
|---|---|---|---|
| `ProfilTab.tsx:81` | dégradé `C.gold→C.goldD` | `11px` | `10px` |
| `ProfilResponsableTab.tsx:138` | `C.gold` uni | `13px 28px` | `12px` |
| `ClockInShiftTab.tsx:1082` | dégradé `C.gold→C.goldD` | `9px` | `8px` |
| `FacturationTab.tsx:178` | `#111` (noir codé en dur, **hors thème**) | `12px` | `10px` |
| `CodeQrTab.tsx:163` | `#F5A623` (hex codé en dur au lieu de `C.gold`) | `13px` | `12px` |

Boutons "danger" (suppression/rejet) — même sévérité, deux langages
visuels différents sans règle apparente : la majorité utilise `C.redL`
(teinte pâle) + texte `C.red`, mais `ParametresTab.tsx:745` utilise `C.red`
**plein** + texte blanc pour la même sévérité d'action.

### 3.2 Confirmations avant action importante

Sur ~20 fichiers ayant au moins une action importante :

- **1 seul `window.confirm()` natif** sur tout le dashboard —
  `ServicesTab.tsx:930-940` (suppression de service). Le bouton
  "Désactiver un service" du même fichier, lui, n'a **aucune**
  confirmation alors qu'il retire le service de la réservation publique.
- **5 modales stylées maison, 5 patterns différents, aucun partagé** :
  - `ValiderRdvTab.tsx` — `MotifModal` local (`:171-203`), motif ≥5
    caractères obligatoire. **Créé explicitement en réaction à un
    signalement de Bryan le 05/08/2026** ("ces boutons déclenchaient
    l'action sans confirmation — pas normal", commentaire `:165-166`) —
    la preuve que ce problème a déjà été identifié et corrigé une fois,
    localement, sans jamais être généralisé.
  - `DocumentsClientsTab.tsx` — `DocModal` local (`:257`), motif de refus
    obligatoire via `<select>`, dialogue centré.
  - `CommunicationTab.tsx:492-506` — bloc JSX sans composant nommé,
    dialogue centré, texte "Cette action est irréversible."
  - `PaiementsTab.tsx:546-557` — bottom-sheet, motif **facultatif**, sans
    garde-fou de longueur (contrairement à `ValiderRdvTab`).
  - `ParametresTab.tsx` (`ParametresDangerZone`) — le plus élaboré :
    assistant à 3 étapes (sondage → conséquences → saisie du nom exact de
    l'institution pour débloquer le bouton). Seul endroit avec ce niveau
    de garde-fou dans tout le dashboard.
- **Majorité des actions destructives : aucune confirmation, action
  directe au clic.** Cas les plus significatifs :
  - `EquipeTab.tsx:641-642` — Suspendre/Supprimer un membre d'équipe (perd
    l'accès dashboard **instantanément**).
  - `MesOffresTab.tsx`/`MesOffresTable.tsx`/`MesOffresOffreDetail.tsx` —
    Suspendre/Supprimer une offre, 3 points d'entrée, aucun confirmé.
  - `ClockInShiftTab.tsx` — 4 cas (suppression document RH, département,
    horaire, changement de statut employé pouvant signifier "parti").
  - `ParametresTab.tsx` — révocation d'un facteur d'authentification
    (WebAuthn) et déconnexion de **tous** les appareils mémorisés en une
    fois, **sans confirmation**, alors que "Supprimer mon compte" juste en
    dessous, dans le même fichier, a l'assistant à 3 étapes le plus
    robuste du dashboard — incohérence de rigueur au sein d'un même écran.

---

## 4. État réel — Dashboard Admin

### 4.1 Boutons

Contrairement à l'institution, un kit partiel existe déjà
(`app/admin/adminUiKit.tsx` : `Badge`, `DataTable`, `SlidePanel`,
`ToastContainer`, `KPICard`, etc., `adminTheme.ts` : tokens `D`). **Mais il
n'exporte ni composant `Button` ni composant de confirmation générique** —
recherche exhaustive (`ConfirmModal|ConfirmDialog|function Button|
useConfirm`) : 0 résultat dans tout `app/admin/**`.

**9 pages sur ~20 n'importent même pas le kit déjà existant** :
`documents`, `feedback`, `messagerie`, `offres`, `partenariats`, `posts`,
`recuperation-comptes`, `satisfaction`, `security` — chacune redéfinit ses
propres badges/boutons, avec des radius différents (`8px`/`20px` au lieu
de `D.radiusSm`/`D.radius`). Deux fichiers (`satisfaction/page.tsx:7`,
`security/page.tsx:7`) portent même un commentaire explicite constatant
l'absence de thème partagé.

`app/admin/page.tsx` (dashboard) et `app/admin/institutions/page.tsx`
**dupliquent quasi-intégralement les 6 mêmes actions institution**
(valider/suspendre/réactiver/refuser/avertir/badge/plan) avec **deux
implémentations distinctes** (l'une en fonctions nommées, l'autre en
`fetch` inline directement dans les `onClick`) — aucune des deux ne
réutilise l'autre.

`app/admin/login/page.tsx` utilise un dégradé vert totalement différent
(`#00c896→#00a37a`) du reste de l'admin (jaune `D.yellow`) — même la
charte de couleur des boutons primaires n'est pas unifiée.

### 4.2 Confirmations avant action importante

Sur ~30 actions importantes recensées à travers tout `app/admin` :

- **3 `window.confirm()` natifs** — `admins/page.tsx:59` (suppression
  d'un admin), `annonces/page.tsx:61` (suppression d'annonce),
  `offres/page.tsx:81` (suppression d'offre).
- **2 confirmations stylées maison, non réutilisables, non partagées** :
  - `security/page.tsx:130-145` — désactivation de la 2FA, ressaisie du
    mot de passe exigée. Le plus robuste de l'admin.
  - `verification/page.tsx:429-449` (Trust Lot 2.5, livré ce même jour) —
    récapitulatif complet + double clic Confirmer/Annuler avant une
    décision permanente. **Le pattern le plus abouti de tout le dépôt**,
    mais codé en dur dans un seul composant, non extrait.
- **1 pattern quasi-standard mais incomplet** : panel "Motif de refus"
  dans un `SlidePanel`, répliqué à l'identique dans
  `institutions/page.tsx:289-303` et `page.tsx:462-473` — mais ce n'est
  qu'une collecte de texte obligatoire, pas une confirmation binaire "êtes-
  vous sûr ?", et il n'est pas non plus extrait en composant partagé
  malgré la duplication exacte entre les deux fichiers.
- **La majorité des actions n'ont aucune confirmation.** Cas les plus à
  risque trouvés :
  - `page.tsx:154-164` (dashboard) — **broadcast de notification à tous
    les citoyens ou toutes les institutions**, un clic sur "Envoyer" sans
    aperçu ni double-validation (`disabled` seulement si le texte est
    vide).
  - `recuperation-comptes/page.tsx:174` — bouton **"Forcer maintenant"**,
    applique instantanément un changement de numéro de téléphone associé
    à un compte citoyen, **contournant le délai de sécurité de 48h**
    explicitement conçu comme garde-fou (commentaire `:5-9`) — aucune
    confirmation.
  - `institutions/page.tsx` & `page.tsx` — Valider/Suspendre/Réactiver/
    Avertir/Badge/Plan tarifaire : les 6 actions, sur les 2 pages qui les
    dupliquent, sans aucune confirmation.
  - `moderation/page.tsx` (CasTab) — Résoudre/Rejeter/Clôturer/Rouvrir un
    dossier (libellés eux-mêmes : "notifie les 2 parties",
    "conservée de façon permanente") : aucune confirmation malgré le
    caractère explicitement permanent et notifiant assumé par le texte du
    bouton.

**Point notable** : `citoyens/page.tsx:65` a un bouton "Voir" **sans aucun
`onClick`** — bouton mort, aucune fonctionnalité de bannissement/action
sur un citoyen ne semble exister dans ce dépôt (recherche exhaustive
"bannir"/"banni" : aucun résultat côté citoyen).

---

## 5. Constat central (les deux dashboards combinés)

1. **Zéro composant Bouton partagé, nulle part dans le produit.**
   Institution : 0 composant. Admin : kit partiel existant mais 0
   composant Button, adopté par 11/20 pages seulement pour le reste du kit.
2. **Zéro composant de confirmation générique, nulle part.** Chaque écran
   qui a résolu le problème (`ValiderRdvTab`, `DocumentsClientsTab`,
   `ParametresDangerZone`, `security/page.tsx`, `verification/page.tsx`)
   l'a fait **indépendamment**, avec un pattern visuel et une rigueur
   différents à chaque fois — jamais extrait, jamais réutilisé.
3. **Le niveau de rigueur d'une confirmation ne dépend pas de la gravité
   réelle de l'action.** Exemples trouvés dans ce seul audit : supprimer
   un compte institution a un assistant à 3 étapes, mais déconnecter tous
   ses appareils n'en a aucune (même fichier). Notifier un citoyen a une
   confirmation possible côté institution (`MesClientsTab`), mais
   notifier **tous les citoyens de Guinée en une fois** (broadcast admin)
   n'en a aucune.
4. **Le problème a déjà été résolu ponctuellement au moins 3 fois**
   (`ValiderRdvTab` en réaction à un retour direct de Bryan,
   `security/page.tsx`, `verification/page.tsx`) sans qu'aucune de ces
   résolutions ne devienne le standard du projet — signe d'un manque de
   repasse transverse plutôt que d'un oubli répété.

---

## 6. Proposition (non appliquée — audit uniquement, comme demandé)

**Aucun code écrit dans ce document.** Proposition à valider avant tout
Lot :

### 6.1 Un composant `Button` unique, à deux emplacements (institution/admin ont des thèmes différents — `C` vs `D` — donc probablement deux fichiers miroir, pas un seul composant cross-thème)
Variants : `primary` (action de sauvegarde/validation), `danger`
(suppression/suspension/révocation), `secondary` (annuler/fermer). Palette
danger unifiée une fois pour toutes (trancher `C.red` plein vs `C.redL`
pâle — actuellement les deux coexistent sans règle).

### 6.2 Un composant `ConfirmModal` générique, réutilisable, à deux emplacements également
Props envisagées : `titre`, `description`, `consequences?` (liste à puces,
pour le cas `ParametresDangerZone`), `motifRequis?` (texte obligatoire,
pour le cas refus/rejet), `confirmationTexte?` (saisie d'un mot exact,
pour les suppressions de compte), `severite` (`normale`/`elevee`, pour
adapter le style du bouton de confirmation). Le pattern le plus abouti
déjà dans le dépôt (`verification/page.tsx`, section "récapitulatif avant
envoi") est le meilleur point de départ pour la conception.

### 6.3 Priorisation suggérée (à valider par Bryan, pas tranchée ici)
Corriger d'abord les actions **sans aucune confirmation à fort impact
réel** plutôt que de tout refaire d'un coup : broadcast citoyens/
institutions, "Forcer maintenant" (recuperation-comptes), suppression
membre d'équipe, déconnexion de tous les appareils. Le reste (uniformiser
tous les boutons visuellement) est un chantier plus large, plus proche du
"Lot UI 4" déjà en attente de validation (voir
`docs/ui/YELEN_UI_DENSITY_AUDIT.md`).

---

## 7. GO reçu — Lot "Gouvernance des actions et confirmation" (16/08/2026)

Ordre imposé par le CEO : **Phase 1** (cartographier les actions
critiques, aucun code) → **Phase 2** (primitives `Button`/`ConfirmModal`)
→ **Phase 3** (migration P0→P1→P2). Ce document couvre la Phase 1.
**Aucun code écrit dans cette section.**

---

## 8. Phase 1 — Cartographie des actions critiques (VERIFIED, aucun code)

Méthodologie : pour chacune des 6 actions demandées, lecture du composant
UI **et** de la route API backend (vérifier que l'autorisation réelle vit
côté serveur, pas seulement dans l'affichage du bouton — exigence CEO
explicite "l'API/backend reste l'autorité finale").

### ⚠️ Découverte majeure pendant la vérification — le broadcast ne fonctionne probablement pas du tout

En vérifiant le backend de l'action #1/#2 (pas en cherchant un bug — trouvé
en confirmant que l'autorité serveur est réelle), lecture complète de
`app/api/admin/broadcast/route.ts` :

- **Ligne 42-43** : pour `cible==='institutions'`, la requête fait
  `.from('institutions').select('user_id')` — **`institutions` n'a pas de
  colonne `user_id`** (confirmé par toute la cartographie de schéma de ce
  projet depuis le Lot 2.1 : les institutions s'authentifient par JWT
  custom sur `institutions.id`, jamais un lien `user_id` vers
  `auth.users`, contrairement aux citoyens). L'erreur PostgREST qui en
  résulterait **n'est jamais vérifiée** (`const { data } = await
  supabaseAdmin.from('institutions')...` sans destructurer `error`) — la
  requête échoue silencieusement, `data` reste `null`/`undefined`,
  `destinataires` reste vide, la route retourne `404 "Aucun destinataire
  trouvé"` à chaque appel.
- **Ligne 56-62** : pour les deux cibles (citoyens **et** institutions),
  l'insertion se fait avec `{ user_id: userId, titre, message, type, lu }`
  — mais la vraie table `notifications` utilise `destinataire_id`/
  `destinataire_type` (confirmé par `lib/notificationEngine.ts:109,225`,
  le mécanisme réellement utilisé par toutes les autres routes de
  notification du projet, y compris celles écrites dans cette même
  session). **Ce drift est déjà documenté de façon générique dans
  CLAUDE.md** (`/backlog-produit` : "`notifications.user_id` vs
  `destinataire_id`/`destinataire_type`... drift signalé, non corrigé")
  mais n'avait jamais été localisé précisément à ce fichier avant cette
  vérification.
- **Conséquence pratique** : même si l'insertion en base réussissait
  techniquement pour les citoyens (si `user_id` existe comme colonne
  legacy sur `notifications`), aucun code de lecture de notifications ne
  filtre sur `user_id` — la notification ne s'afficherait donc **jamais**
  à personne. Le broadcast citoyens semble non fonctionnel en pratique ;
  le broadcast institutions échoue à coup sûr avant même d'écrire quoi que
  ce soit (mauvaise colonne source).
- **Ce lot ne corrige pas ce bug** — conforme à "ne touche pas aux
  fonctionnalités métier existantes, ne transforme pas ce chantier en
  redesign". Reporté ici pour que Bryan tranche séparément. **Conséquence
  sur la priorisation de ce lot** : tant que ce bug n'est pas corrigé, le
  risque réel de "broadcast accidentel massif" est nul en pratique (rien
  ne part) — mais la gouvernance doit être conçue correctement dès
  maintenant pour le jour où ce bug sera corrigé, pas après coup.

### 8.1 Broadcast vers tous les citoyens

| Dimension | Détail |
|---|---|
| Fichier/route | `app/admin/page.tsx:154-164` (UI) → `POST /api/admin/broadcast` (`app/api/admin/broadcast/route.ts`) |
| Autorisation backend | `authorizeAdmin(request, 'broadcast.create')` — **VERIFIED**, restreint à `super_admin` seul (CLAUDE.md, déjà durci) |
| Impact | Notification poussée à **tous** les citoyens inscrits (`users`, sans filtre) — portée maximale du produit côté citoyen |
| Niveau de risque | **Élevé** en conception (portée totale, message non rappelable) — **nul en pratique actuellement** (bug ci-dessus, rien n'est réellement délivré) |
| Confirmation requise | **Renforcée** : aperçu exact du message + nombre de destinataires réels (déjà retourné par l'API : `destinataires_count`, jamais affiché côté client aujourd'hui) + saisie de confirmation avant envoi |
| Données à afficher | Texte exact du message, cible ("citoyens"), estimation ou nombre réel de destinataires, irréversibilité explicite |
| Conséquence | Notification créée pour chaque citoyen (une fois le bug corrigé) |
| Annulation | Aucune après envoi — seule une pré-visualisation avant validation permet d'éviter l'erreur |
| Résultat attendu | Aucun envoi sans confirmation renforcée ; le nombre réel de destinataires (déjà calculé serveur) doit être visible **avant** confirmation, pas seulement après |

### 8.2 Broadcast vers toutes les institutions

Même structure que 8.1, cible `institutions` au lieu de `users`. Portée
plus restreinte en nombre mais impact par destinataire potentiellement
plus élevé (message reçu par une organisation professionnelle). **Bloqué
par le même bug (colonne source `user_id` inexistante) — échoue avant
même la phase d'écriture.** Même traitement recommandé que 8.1 (renforcée).

### 8.3 « Forcer maintenant » — récupération de compte

| Dimension | Détail |
|---|---|
| Fichier/route | `app/admin/recuperation-comptes/page.tsx:174` (UI) → `PATCH /api/admin/recuperation` action=`forcer` (`app/api/admin/recuperation/route.ts:98-117`) |
| Autorisation backend | `authorizeAdmin(request, 'recuperation.manage')` — **VERIFIED**, restreint à `super_admin` seul |
| Impact | Contourne explicitement le délai de sécurité de 48h (`DELAI_ACTIVATION_MS`, ligne 11) conçu comme garde-fou anti-usurpation ; change immédiatement le numéro de téléphone (ou réinitialise la 2FA TOTP) lié à un compte citoyen réel |
| Niveau de risque | **Très élevé** — sécurité d'un compte citoyen réel, bypass volontaire d'une protection anti-fraude, erreur possible = usurpation d'identité |
| Confirmation requise | **Renforcée** — avertissement explicite "vous contournez le délai de sécurité de 48h conçu pour éviter les usurpations", récapitulatif de la demande |
| Données à afficher | Identité déclarée du demandeur, ancien numéro vs nouveau numéro (ou type TOTP), temps restant avant activation normale, date de la demande initiale |
| Conséquence | Accès au compte transféré immédiatement vers le nouveau numéro/la 2FA réinitialisée |
| Annulation | Non automatique — nécessiterait une nouvelle action manuelle inverse (pas un "annuler" en un clic) |
| Résultat attendu | Confirmation renforcée systématique ; déjà bien tracé côté serveur (`admin_logs`, action `RECUPERATION_FORCEE`) — seul le garde-fou UI manque |

### 8.4 Suppression définitive d'un membre d'équipe

| Dimension | Détail |
|---|---|
| Fichier/route | `app/institution/[id]/dashboard/components/EquipeTab.tsx:642` (bouton) → `onSupprimer` → `DELETE /api/institution/membres` (`app/api/institution/membres/route.ts:189-211`) |
| Autorisation backend | `can(membre.role, "equipe.write")` — **VERIFIED**, seul le rôle `admin` ; protection supplémentaire déjà présente : `compte_principal` ne peut jamais être supprimé (ligne 210) |
| Impact | Suppression **définitive** du compte membre (pas une désactivation) — perte d'accès immédiate et irréversible pour cette personne |
| Niveau de risque | **Élevé** (irréversible au sens strict — le compte disparaît, pas juste `actif=false`) |
| Confirmation requise | **Renforcée-simple** : nommer explicitement la personne visée, avertir que c'est définitif (pas une suspension), pas nécessairement une saisie de texte complète comme `ParametresDangerZone` (portée plus limitée — un seul compte, pas toute l'institution) |
| Données à afficher | Nom du membre, rôle actuel, rappel explicite "ce compte sera définitivement supprimé, pas seulement désactivé" |
| Conséquence | Compte membre supprimé, perte d'accès dashboard immédiate |
| Annulation | Non — nécessite de recréer un nouveau compte (identifiant potentiellement différent) |
| Résultat attendu | Confirmation avec récapitulatif nominatif avant tout DELETE |

**Distinction importante trouvée en cartographiant** : le bouton
**"Suspendre/Réactiver"** du même fichier (`EquipeTab.tsx:641`, toggle
`actif`) est une action **différente et moins risquée** — réversible en un
clic inverse. Risque **Moyen**, confirmation **simple** suffisante
("Suspendre l'accès de X ?"), classée séparément en P1 (section 9), pas au
même niveau que la suppression définitive.

### 8.5 Déconnexion de tous les appareils mémorisés (institution)

| Dimension | Détail |
|---|---|
| Fichier/route | `app/institution/[id]/dashboard/components/ParametresTab.tsx:451-453` (bouton) → `revokeAllRememberDevices` → `POST /api/institution/auth/remember/revoke-all` |
| Autorisation backend | **VERIFIED, mais point d'attention trouvé** : la route vérifie uniquement qu'une session institution valide existe (`getAuthenticatedInstitutionId`) — **aucun `can(membre.role, ...)`**, donc n'importe quel rôle (agent, comptable...) peut déconnecter **tous les appareils de toute l'institution**, pas seulement les siens. Exclut intelligemment l'appareil courant (ligne 28-30, 48-49) pour ne jamais se couper soi-même. |
| Impact | Pas de perte de données — force une reconnexion sur tous les autres appareils. Interruption de commodité potentiellement large si l'institution utilise plusieurs postes activement (guichet + bureau) |
| Niveau de risque | **Moyen** — gênant mais non destructif, réversible dans les faits (chaque appareil peut simplement se reconnecter) |
| Confirmation requise | **Simple** — "Déconnecter N appareil(s) mémorisé(s) ? Ils devront se reconnecter." |
| Données à afficher | Nombre d'appareils concernés (à calculer côté serveur avant confirmation, pas encore fait aujourd'hui) |
| Conséquence | Reconnexion nécessaire sur les autres appareils |
| Annulation | Non directement, mais réversible dans les faits |
| Résultat attendu | Confirmation simple suffisante. **Point à trancher séparément par Bryan, hors périmètre visuel de ce lot** : faut-il restreindre cette route à `equipe.write` (comme la suppression de membre) plutôt que "tout membre authentifié" ? |

### 8.6 Suspendre une institution (admin)

Retenue comme 6ᵉ action au même niveau de risque que les 5 demandées —
justification : impact civique réel et immédiat sur un tiers (citoyens
dépendant du service), zéro confirmation, zéro motif collecté (cont&nbsp;à
comparer à "Refuser" qui, lui, collecte déjà un motif obligatoire pour une
action de sévérité comparable).

| Dimension | Détail |
|---|---|
| Fichier/route | `app/admin/institutions/page.tsx:184/267` + `app/admin/page.tsx:502` (UI) → `POST /api/admin/institutions/[id]/suspendre` |
| Autorisation backend | `authorizeAdmin(request, 'institutions.manage')` — **VERIFIED** |
| Impact | Institution retirée de la recherche/réservation citoyenne, immédiatement ; **aucun motif n'est collecté ni transmis** — la notification envoyée à l'institution est générique ("contactez le support"), l'institution n'apprend jamais pourquoi |
| Niveau de risque | **Élevé** — impact civique réel (rappel du principe du projet : "une erreur ici n'est pas cosmétique") |
| Confirmation requise | **Renforcée-simple** : motif obligatoire (aligner sur le flux "Refuser" déjà existant) + confirmation nominative |
| Données à afficher | Nom de l'institution, statut actuel, rappel qu'elle disparaît de la recherche citoyenne |
| Conséquence | Institution invisible aux citoyens jusqu'à réactivation |
| Annulation | **Oui** — un bouton "Réactiver" existe déjà, contrairement aux 5 autres actions de cette liste. Risque donc légèrement inférieur à "Forcer maintenant"/suppression membre, mais toujours au-dessus du seuil "confirmation simple" à cause de l'absence totale de motif collecté aujourd'hui |
| Résultat attendu | Motif obligatoire ajouté (aligné sur "Refuser"), transmis à l'institution dans la notification (actuellement générique) |

---

## 9. Taxonomie des risques (proposée à partir de la cartographie ci-dessus)

| Niveau | Définition | Confirmation | Exemples déjà trouvés dans l'audit |
|---|---|---|---|
| **0 — Aucune** | Non destructif, réversible en un clic, portée limitée à l'auteur de l'action | Aucune | Filtrer, exporter, marquer comme lu, changer un onglet |
| **1 — Simple** | Réversible par une action inverse évidente, portée limitée | "Êtes-vous sûr ?" + nom de la cible | Suspendre/réactiver un membre d'équipe, déconnecter les appareils mémorisés |
| **2 — Motif obligatoire** | Affecte un tiers de façon notifiée, réversible mais avec délai/friction réelle | Motif texte obligatoire + confirmation | Refuser une institution/offre (déjà existant), suspendre une institution (à ajouter) |
| **3 — Renforcée** | Irréversible, OU portée massive, OU contourne un garde-fou de sécurité existant | Récapitulatif complet des conséquences + saisie de confirmation (nom exact / mot-clé) | Suppression définitive de compte (`ParametresDangerZone`, déjà conforme), suppression définitive d'un membre d'équipe, "Forcer maintenant", broadcast massif |

**Règle centrale (rappel CEO)** : friction proportionnelle au risque —
ni sous-protection (niveau 3 traité comme niveau 0, le problème actuel),
ni sur-protection généralisée (niveau 0 traité comme niveau 3, qui produit
de la fatigue décisionnelle et des clics mécaniques).

---

## 10. Tableau d'état — Phase 1

| Élément | État | Preuve | Risque restant | Prochaine action |
|---|---|---|---|---|
| Cartographie des 6 actions critiques | **CLOS** | Sections 8.1-8.6 ci-dessus, chaque ligne source citée fichier+ligne | Aucun — cartographie uniquement, pas d'exposition | Phase 2 (primitives) |
| Vérification autorité backend des 6 actions | **VERIFIED** pour 5/6 (permissions correctement gatées), **1 bug réel trouvé** (broadcast) | Lecture directe des 6 routes API | Broadcast non fonctionnel — **BLOCKED**, décision Bryan nécessaire (corriger le drift `user_id`/`destinataire_id` avant ou après la gouvernance UI ?) | Remonter le bug séparément, ne pas le corriger dans ce lot |
| Taxonomie des risques (4 niveaux) | **IN PROGRESS** — proposée, pas encore validée par le CEO | Section 9 | Aucune application tant que non validée | Validation CEO avant Phase 2 |
| Distinction Suspendre/Supprimer un membre d'équipe | **CLOS** | Lecture `EquipeTab.tsx:641-642` + `app/api/institution/membres/route.ts` | Aucun | Classer séparément en P1/P0 (Phase 3) |
| Gate de permission sur "déconnexion tous appareils" (tout rôle vs `equipe.write` seul) | **NOT VERIFIED comme un problème** — c'est un constat, pas encore une décision produit | `app/api/institution/auth/remember/revoke-all/route.ts` — aucun `can()` trouvé | Faible (pas de perte de données) mais portée plus large que prévu | Décision Bryan, hors périmètre visuel de ce lot |
| Motif obligatoire manquant sur "Suspendre une institution" | **NOT VERIFIED comme corrigé** — constat fait, rien changé | `app/api/admin/institutions/[id]/suspendre/route.ts` — aucun champ motif | Modéré — institution jamais informée du motif réel | À corriger en Phase 3 avec la migration de cette action |

**Phase 1 terminée. Aucun code écrit. En attente de validation de la
taxonomie (section 9) avant de démarrer la Phase 2 (primitives
`Button`/`ConfirmModal`).**

---

## 11. Phase 2 — Primitives + première migration (16/08/2026)

Taxonomie (section 9) validée par le CEO. GO explicite reçu pour construire
les primitives et migrer les 4 actions P0 listées ci-dessous — **pas** le
broadcast (backend cassé, hors périmètre de ce lot) ni la généralisation à
tous les écrans (réservée à la Phase 3).

### 11.1 Primitives créées

**`components/ui/Button.tsx`** — composant unique, théoriquement agnostique
(zéro import `app/admin/*`/`app/institution/*`, zéro couleur en dur) :
chaque appelant lui fournit un objet `tokens: ButtonTokens` (accent,
surface, border, text, textMuted, danger, dangerBg, dangerBorder, radius,
radiusSm, font) construit à partir de sa propre palette existante — jamais
une nouvelle couleur. Tailles `sm`/`md`/`lg` (32/40/48px), variantes
`primary`/`secondary`/`ghost`/`danger`/`danger-ghost`, `loading` (spinner
SVG, désactive le bouton), `disabled`, anneau de focus clavier
(`:focus-visible` uniquement, jamais au clic souris — règle CSS ajoutée
dans `app/globals.css`), anti-double-soumission intégrée : si `onClick`
renvoie une Promise, le bouton se désactive jusqu'à sa résolution — un
deuxième clic pendant ce laps de temps n'atteint jamais le handler (un
`<button disabled>` ne reçoit plus d'événement `click` natif).

**`components/ui/ConfirmModal.tsx`** — **une seule primitive**, niveau de
risque configurable (`level: 1 | 2 | 3`, pas trois composants distincts,
conformément à l'instruction explicite). Reprend telle quelle la
convention déjà en place (`.client-fiche-*`/`.equipe-fiche-*`) : bottom
sheet mobile-first, dialogue centré ≥1024px (règles CSS centralisées dans
`app/globals.css`, classes `.yelen-confirm-*`, pas un 2e système
parallèle). Comportement par niveau :
- **Niveau 1 (simple)** : titre + description + bouton Confirmer/Annuler.
- **Niveau 2 (motif obligatoire)** : ajoute un champ texte requis, bouton
  Confirmer désactivé tant qu'il est vide.
- **Niveau 3 (renforcée)** : `confirmWord` optionnel (texte exact à
  retaper, bouton désactivé sinon) ; **le clic sur le fond n'annule pas**
  (évite qu'un misclic referme une modale en cours de lecture/saisie) —
  seuls le bouton Annuler explicite ou Échap restent disponibles.

Accessibilité : `role="dialog"` + `aria-modal` + `aria-labelledby`, focus
envoyé dans le panneau à l'ouverture, restauré sur l'élément déclencheur à
la fermeture, piège de focus (Tab/Shift+Tab ne sortent jamais du panneau).
**Échap ferme toujours**, à tous les niveaux — annuler ne coûte jamais
rien, donc jamais bloqué, y compris au niveau 3.

**Adaptateurs de tokens** (pas de nouvelle palette, juste une reformulation
de l'existant) : `toUiTokens(C)` ajouté dans
`app/institution/[id]/dashboard/theme.ts` (dérivé de `C`, change avec
dark/light) et `uiTokens` ajouté dans `app/admin/adminTheme.ts` (dérivé de
`D`, singleton — admin reste dark forcé). Centralisés une seule fois pour
que les migrations futures (Phase 3, ~30 fichiers `*Tab.tsx` restants)
n'aient pas à redéfinir cet objet à chaque fois.

### 11.2 Migration — 4 actions P0

| # | Action | Fichier(s) | Niveau | Détail |
|---|---|---|---|---|
| 1 | Forcer maintenant | `app/admin/recuperation-comptes/page.tsx` | 3, renforcée | `confirmWord="FORCER"`, conséquences listées (bypass du délai 48h, bascule immédiate ou désactivation 2FA), irréversible signalé explicitement |
| 2 | Suppression membre équipe | `EquipeTab.tsx` (`MembreDetailModal`) | 3, renforcée | `confirmWord={membre.prenom}`, distingue explicitement "définitivement supprimé" de "suspendu", irréversible |
| 3 | Suspendre une institution | `app/api/admin/institutions/[id]/suspendre/route.ts` + `app/admin/institutions/page.tsx` | 2, motif obligatoire | **Backend modifié** : motif désormais requis (400 sinon, exact miroir du pattern déjà existant sur `refuser/route.ts`), stocké dans `admin_logs.details.motif`, transmis dans la notification à l'institution (avant : générique, sans motif) |
| 4 | Déconnexion tous les appareils | `ParametresTab.tsx` | 1, simple | Confirmation simple avec nombre d'appareils concernés ; **le gap de permission backend n'a pas été touché** (voir 11.3) |

### 11.3 Gaps documentés séparément — non corrigés dans ce lot

- **Broadcast (`app/api/admin/broadcast/route.ts`)** : **NOT VERIFIED /
  BUG CONFIRMED IN CODE — CORRECTION HORS PÉRIMÈTRE.** Colonne
  `institutions.user_id` inexistante et mapping `notifications.user_id`
  au lieu de `destinataire_id`/`destinataire_type` (détail complet section
  8, "Découverte majeure"). Ni migré ni corrigé — fera l'objet d'un
  chantier séparé (logique métier/backend), pas de ce lot UX.
- **Déconnexion tous appareils — absence de restriction de rôle côté
  backend** (`app/api/institution/auth/remember/revoke-all/route.ts`) :
  **NOT VERIFIED comme corrigé — GAP DE SÉCURITÉ/AUTORISATION SÉPARÉ,
  NON CORRIGÉ.** Tout membre authentifié (pas seulement `equipe.write`)
  peut aujourd'hui déconnecter tous les appareils de toute l'institution.
  La confirmation UI ajoutée dans ce lot ne change rien à cette
  autorisation côté serveur — rappel explicite du principe CEO : **une
  confirmation UI ne remplace jamais une autorisation backend.** Décision
  produit à prendre séparément par Bryan (restreindre à `equipe.write` ou
  non).

### 11.4 Tableau d'état — Phase 2

| Élément | État | Preuve | Risque restant | Prochaine action |
|---|---|---|---|---|
| `components/ui/Button.tsx` | **VERIFIED** (compilation) | `npx tsc --noEmit` exit 0 sur l'ensemble du projet après création | Aucun test réel navigateur (clavier/focus/mobile/double-clic) | Vérification réelle par Bryan (voir liste 11.5) |
| `components/ui/ConfirmModal.tsx` | **VERIFIED** (compilation) | Idem | Idem — focus trap, Échap, niveau 3 backdrop non testés en conditions réelles | Idem |
| Migration #1 — Forcer maintenant | **IN PROGRESS** (code posé, compile) | `tsc --noEmit` exit 0 | Parcours réel jamais cliqué (aucun outil navigateur dans cet environnement) | Test réel Bryan (voir 11.5) |
| Migration #2 — Suppression membre | **IN PROGRESS** (code posé, compile) | `tsc --noEmit` exit 0 | Idem | Idem |
| Migration #3 — Suspendre institution (motif) | **IN PROGRESS** (code posé, compile) | `tsc --noEmit` exit 0 | Idem + vérifier que la notification avec motif s'affiche bien côté institution | Idem |
| Migration #4 — Déconnexion appareils | **IN PROGRESS** (code posé, compile) | `tsc --noEmit` exit 0 | Idem | Idem |
| Backend `suspendre/route.ts` (motif requis) | **VERIFIED** (compilation + relecture miroir de `refuser/route.ts`) | Lecture directe, pattern identique déjà en production sur `refuser` | Aucun appel réel testé (pas de terminal/SQL exécuté par Claude) | Test réel Bryan |
| Bug broadcast | **NOT VERIFIED / BUG CONFIRMED IN CODE — CORRECTION HORS PÉRIMÈTRE** | Lecture directe `broadcast/route.ts` (section 8) | Broadcast probablement non fonctionnel dans les 2 sens | Chantier séparé, décision Bryan |
| Gap permission revoke-all | **NOT VERIFIED comme corrigé — GAP DE SÉCURITÉ SÉPARÉ** | Lecture directe `revoke-all/route.ts` | Tout membre peut déconnecter toute l'institution | Décision produit Bryan |
| `npm run build` complet | **VERIFIED** | Lancé après toutes les migrations — `✓ Compiled successfully`, `Generating static pages (300/300)`, `BUILD_EXIT:0`. Toutes les routes touchées présentes dans la sortie (`/admin/verification`, `/admin/recuperation-comptes`, `/admin/institutions`, `/api/admin/institutions/[id]/suspendre`, etc.), zéro erreur de prerendering | Build très lent sur cette machine (35 min de compilation — contrainte RAM déjà documentée, sans lien avec ce lot) mais propre | Aucune — build clos |

**Aucun élément marqué CLOS.** Rien n'a été testé en conditions réelles
(clic normal, double-clic, loading, annulation, clavier/focus, mobile,
erreur API, permissions, session expirée) — cet environnement ne dispose
d'aucun outil navigateur, conformément au principe d'honnêteté du projet.

### 11.5 Checklist de test réel — à exécuter par Bryan avant toute clôture

Pour chacune des 4 migrations, dans l'ordre suggéré par le brief CEO :
clic normal → double-clic (vérifier qu'une seule requête part) → état
loading visible → annulation (Échap + bouton + backdrop selon le niveau)
→ navigation clavier complète (Tab reste dans la modale, focus revient au
bouton déclencheur à la fermeture) → mobile (bottom sheet) → erreur API
(couper le réseau ou simuler un 500) → succès API → permission
insuffisante (rôle non autorisé) → session expirée.

**Rien de tout cela n'a pu être vérifié dans cet environnement.** `npm run
build` complet également à lancer avant de considérer ce lot terminé.

---

## 11.6 Clôture rigoureuse (17/08/2026) — revue code + test réel partiel

Méthodologie : relecture intégrale du code des 4 migrations (UI + route API
de chaque action), comparaison avec 1 capture navigateur réelle fournie par
Bryan (Déconnexion appareils), recherche exhaustive de `window.confirm()`
et de patterns divergents. **2 captures annoncées (Suppression membre,
Suspension institution) n'ont pas été fournies** — Bryan a choisi
explicitement de poursuivre sans elles (ces 2 parcours restent donc
`NOT VERIFIED` au sens "test réel navigateur", même si le code a été
relu). **2 bugs réels trouvés en relisant le code, non connus avant cette
revue** (détail 11.6.2/11.6.3).

### 11.6.1 Action 1 — Forcer maintenant (`app/admin/recuperation-comptes/page.tsx`)

**BACKEND** (`app/api/admin/recuperation/route.ts`) :
- Permission : `authorizeAdmin(request, 'recuperation.manage')`, super_admin seul — **VERIFIED** (lecture directe, ligne 59)
- Validation serveur : `userId` requis (`demande.user_id` ou body), 400 sinon (ligne 108) — **VERIFIED**
- Motif obligatoire : non applicable à cette action (le garde-fou est le mot `FORCER` côté UI, pas un motif métier collecté serveur) — **OUT OF SCOPE**
- Comportement d'erreur : `try/catch`, `AdminAuthError` géré séparément, sinon 500 générique sans fuite de stack — **VERIFIED**
- Protection double soumission : aucune protection serveur dédiée (pas de verrou/idempotency key) — **NOT VERIFIED comme couvert**, mitigé uniquement côté UI
- Résultat réel : **NOT VERIFIED** (aucune capture reçue pour cette action)

**UI** :
- Niveau de confirmation : 3 (renforcée) — **VERIFIED**
- Conséquences affichées : 3 puces (bypass 48h, effet immédiat, perte d'accès ancien titulaire) — **VERIFIED**
- Réversibilité affichée : `reversible={false}` + note explicite — **VERIFIED**
- Champ motif : absent (remplacé par le mot de confirmation, cohérent avec le design) — **VERIFIED**
- Confirmation par mot exact : `confirmWord="FORCER"` — **VERIFIED**
- Bouton désactivé : ouverture désactivée si `!d.compte_trouve`, confirmation désactivée tant que le mot n'est pas retapé exactement (`canConfirm` du composant) — **VERIFIED**
- Annulation / clavier / mobile : comportement générique `ConfirmModal` (Échap ferme toujours, focus trap, backdrop ne ferme pas en niveau 3) — **VERIFIED par lecture**, **NOT VERIFIED en conditions réelles**

### 11.6.2 Action 2 — Suppression membre équipe (`EquipeTab.tsx::MembreDetailModal`)

**BACKEND** (`app/api/institution/membres/route.ts` DELETE) :
- Permission : `can(membre.role, "equipe.write")`, sinon 403 + `enregistrerAction` (accès refusé journalisé) — **VERIFIED**
- Scope BOLA : vérifie `cible.institution_id === membre.institutionId` avant toute suppression — **VERIFIED**
- Protection compte principal : 400 si `cible.compte_principal` — **VERIFIED**
- Comportement d'erreur : message explicite retourné, pas de fuite — **VERIFIED**
- Protection double soumission serveur : aucune dédiée, mitigation prévue côté UI uniquement (voir bug ci-dessous — la mitigation UI est cassée) — **BUG CONFIRMED** (conséquence)
- Résultat réel : **NOT VERIFIED** (aucune capture reçue)

**UI** :
- Niveau : 3 (renforcée) — **VERIFIED**
- Conséquences affichées : 3 puces (définitif, perte d'accès immédiate, recréation nécessaire) — **VERIFIED**
- Réversible : `reversible={false}` — **VERIFIED**
- Confirmation par prénom exact : `confirmWord={membre.prenom}` — **VERIFIED**
- Bouton désactivé tant que le prénom n'est pas retapé — **VERIFIED**

**BUG CONFIRMED (EquipeTab.tsx:657)** :
```
onConfirm={async () => { onSupprimer(membre.id); setConfirmSupprimer(false); }}
```
`onSupprimer` (= `supprimer()` dans le composant parent, une fonction `async`
qui fait le `fetch DELETE`) est appelée **sans `await`**. Conséquence
directe, vérifiable par simple lecture (pas une hypothèse) :
- La modale se ferme (`setConfirmSupprimer(false)`) immédiatement après le
  *déclenchement* du DELETE, sans attendre sa résolution — l'état de
  chargement (`busy`/spinner) du bouton "Supprimer définitivement" n'est
  jamais visible en pratique, contrairement à l'intention documentée en
  11.1 ("anti-double-soumission intégrée").
- La protection anti-double-clic du composant `Button`/`ConfirmModal`
  (qui ne fonctionne que si `onClick`/`onConfirm` reste *pending* jusqu'à
  la fin réelle de l'opération) est donc neutralisée pour cette action
  précise : le bouton redevient cliquable après un seul tick, bien avant
  que le DELETE réseau ne soit terminé.
- Si l'appel échoue (`onToast("Erreur de suppression", ...)`), l'utilisateur
  ne le voit jamais dans la modale — elle est déjà fermée.
- **Comparaison directe** : Migration #1 (`await agir(...)`) et Migration #4
  (`await revokeAllRememberDevices()`) font ce `await` correctement — ce
  n'est donc pas une limite du composant partagé, c'est un oubli localisé
  à ce seul appelant.

**Corrigé le 17/08/2026, sur validation explicite de Bryan** : `onSupprimer`
retypé `(id: string) => Promise<void>` (reflète l'implémentation réelle,
déjà async) et `onConfirm` fait désormais `await onSupprimer(membre.id)`
avant de fermer la modale — même pattern que Migration #1/#4.
`tsc --noEmit` et `npm run build` propres après correctif. **Non re-testé
en conditions réelles navigateur** (aucune capture post-correctif).

- Annulation / clavier / mobile : comportement générique `ConfirmModal` — **VERIFIED par lecture**, **NOT VERIFIED en conditions réelles**

### 11.6.3 Action 3 — Suspendre une institution (admin)

**BACKEND** (`app/api/admin/institutions/[id]/suspendre/route.ts`) :
- Permission : `authorizeAdmin(request, 'institutions.manage')` — **VERIFIED**
- Motif obligatoire : 400 si `!motif?.trim()` — **VERIFIED**
- Notification à l'institution : transmet désormais le motif réel (au lieu du message générique d'avant ce lot) — **VERIFIED** (lecture ligne 56)
- Traçabilité : `admin_logs.details.motif` — **VERIFIED**
- Comportement d'erreur : `try/catch`, pas de fuite — **VERIFIED**
- Protection double soumission serveur : aucune dédiée — **NOT VERIFIED comme couvert**
- Résultat réel : **NOT VERIFIED** (aucune capture reçue)

**UI** — panneau détail (`app/admin/institutions/page.tsx`, bouton "Suspendre" du `SlidePanel` `panel==='detail'`, ligne 270) :
- Niveau : 2 (motif obligatoire) — **VERIFIED**
- Conséquences affichées : 2 puces (disparition recherche citoyenne, notification avec motif) — **VERIFIED**
- Réversible affiché : oui (`reversible`, cohérent — bouton "Réactiver" existe) — **VERIFIED**
- Champ motif obligatoire, bouton désactivé tant qu'il est vide (`motifOk`) — **VERIFIED**
- Annulation / clavier / mobile : génériques `ConfirmModal` — **VERIFIED par lecture**, **NOT VERIFIED en conditions réelles**

**BUG CONFIRMED (institutions/page.tsx:187)** — bouton mort dans la vue liste :
```
<button onClick={() => { setSelected(inst); setPanel('suspendre') }} ...>{Ic.Ban(D.red)}</button>
```
Ce bouton d'action rapide (icône Ban, colonne "actions" du tableau) tente
d'ouvrir un panneau `panel === 'suspendre'` — **qui n'existe nulle part
dans ce fichier** (seuls `panel === 'detail'` et `panel === 'refus'` ont un
`SlidePanel` correspondant, confirmé par recherche exhaustive). Au clic,
`selected`/`panel` changent d'état mais **rien ne s'affiche** — bouton
mort. Seul le bouton "Suspendre" *à l'intérieur* du panneau détail (donc
après avoir cliqué "Voir" d'abord) déclenche réellement la `ConfirmModal`
migrée et fonctionnelle. Ce bug n'est pas documenté avant cette revue —
probable oubli de mise à jour lors du remplacement de l'ancien comportement
par la nouvelle `ConfirmModal`, cette entrée n'ayant pas été mise à jour en
même temps.

**Corrigé le 17/08/2026, sur validation explicite de Bryan** : le bouton
ouvre désormais directement `setConfirmSuspendre(true)` (même mécanisme
que le bouton du panneau détail), au lieu de `setPanel('suspendre')`.
`tsc --noEmit` et `npm run build` propres après correctif. **Non re-testé
en conditions réelles navigateur** (aucune capture post-correctif).

**GAP DE PÉRIMÈTRE confirmé (pas un bug, une omission de portée)** —
`app/admin/page.tsx:502` :
```
<button onClick={() => suspendreInst(selectedInst.id)} ...>Suspendre</button>
```
Cette 2ᵉ implémentation dupliquée de "Suspendre" (déjà documentée en
section 4.1/5 comme un doublon jamais unifié) appelle directement
`suspendreInst()` → `fetch POST .../suspendre` **sans aucune `ConfirmModal`,
sans motif, sans confirmation** — le tableau 11.2 ne mentionnait que
`app/admin/institutions/page.tsx` comme fichier migré, `app/admin/page.tsx`
n'a donc jamais fait partie du périmètre de ce lot. **Conséquence concrète :
l'objectif "plus aucune suspension d'institution sans motif ni
confirmation" n'est PAS atteint globalement** — seulement sur un des deux
points d'entrée existants dans le produit. `OUT OF SCOPE` tel qu'écrit,
mais à signaler explicitement à Bryan car le risque réel (section 8.6)
reste ouvert depuis le dashboard admin.

### 11.6.4 Action 4 — Déconnexion tous les appareils (institution)

**BACKEND** (`app/api/institution/auth/remember/revoke-all/route.ts`) :
- Permission : authentification institution valide uniquement (`getAuthenticatedInstitutionId`), **toujours aucun `can()`** — gap déjà documenté en 11.3, **NOT VERIFIED comme corrigé — GAP DE SÉCURITÉ SÉPARÉ**, inchangé, hors périmètre de ce lot (confirmé, non re-corrigé ici)
- Exclusion de l'appareil courant par hash du token courant (`neq('token_hash', ...)`) — **VERIFIED**
- Comportement d'erreur : codes structurés (`NO_SESSION`/`DELETE_ERROR`/`SERVER_ERROR`), pas de fuite — **VERIFIED**
- Double soumission : `DELETE ... WHERE institution_id=... AND token_hash != ...` est intrinsèquement idempotent (rejouer ne supprime rien de plus) — **VERIFIED comme sûr même sans verrou dédié**
- Résultat réel : **VERIFIED — MANUAL BROWSER TEST** (voir capture ci-dessous)

**UI** (`ParametresTab.tsx`) :
- Niveau : 1 (simple) — **VERIFIED**
- Nombre d'appareils affiché dynamiquement (`remember_devices.length - 1`) — **VERIFIED**
- Réversibilité affichée ("Cette action est réversible.") — **VERIFIED**
- Pas de champ motif (cohérent avec le niveau 1) — **VERIFIED**
- `await` correctement posé : `await revokeAllRememberDevices(); setConfirmRevokeAll(false)` — **VERIFIED**, contrairement au bug de la Migration #2

**VERIFIED — MANUAL BROWSER TEST** (capture fournie par Bryan, 17/08/2026,
`localhost:3000/institution/.../dashboard`) :
Ce que la capture permet de vérifier : la modale s'affiche réellement dans
un navigateur (pas seulement en théorie de compilation), avec le bon
titre ("Déconnecter les autres appareils ?"), le bon texte dynamique
("6 appareil(s) mémorisé(s) devront se reconnecter — celui-ci reste
connecté."), la mention "Cette action est réversible.", le style
bottom-sheet centré desktop conforme à la convention `.yelen-confirm-*`,
les boutons Annuler/Déconnecter au bon style (doré, cohérent thème
institution).
Ce que la capture NE permet PAS de vérifier : le résultat réel du clic sur
"Déconnecter" (pas de 2ᵉ capture après action), l'état de chargement du
bouton, le comportement Échap/clavier, le comportement sur mobile, le cas
d'erreur réseau, le comportement du clic sur le fond (niveau 1 →
`backdropCloses=true` attendu mais non visible sur une capture statique).

### 11.6.5 Sweep global (item 11 de la mission)

- `npx tsc --noEmit` — **VERIFIED**, exit 0, aucune erreur sur l'ensemble du projet (relancé le 17/08/2026, après la revue de code ci-dessus)
- `npm run build` — **VERIFIED**, `✓ Compiled successfully in 8.0min` (17/08/2026, après application des 2 correctifs ci-dessous), `/institution/[id]/dashboard` et toutes les routes touchées présentes dans la sortie, zéro erreur
- Recherche `window.confirm()` exhaustive : 10 occurrences trouvées au total. **1 seule dans le périmètre dashboard institution/admin déjà documenté** (`ServicesTab.tsx:934`, connu depuis Phase 1, non touché par ce lot — action différente, hors des 4 P0). **Les 8 autres sont côté écrans citoyen** (`compte/securite`, `profil`, `mes-avis`, `informations-personnelles`, `favoris`) — **jamais dans le périmètre de ce chantier de gouvernance** (Phase 1, sections 3-4, ne couvrait que dashboard institution + admin) : ni une régression, ni un oubli de ce lot, simplement hors scope, à documenter pour Phase 3 si un jour étendue au citoyen.
- Aucun nouveau `window.confirm()` ni pattern de confirmation divergent introduit par les 4 migrations P0 — **VERIFIED** (les 4 fichiers touchés n'utilisent que `Button`/`ConfirmModal`, tokens via `uiTokens`/`toUiTokens`, classes CSS `.yelen-confirm-*`/`.yelen-focus-ring` centralisées dans `app/globals.css`, zéro couleur en dur ajoutée)
- Boutons critiques non migrés (P1/P2) : état inchangé depuis la cartographie Phase 1 (sections 3.2/4.2) — non re-vérifié intégralement dans cette session (hors périmètre de cette clôture, réservé à la priorisation Phase 3)

### 11.6.6 Tableau d'état définitif — 4 migrations P0

| Action | UI | Backend | Test réel | Statut | Preuve | Reste |
|---|---|---|---|---|---|---|
| Forcer maintenant (récupération compte) | Niveau 3, `confirmWord="FORCER"`, conséquences + irréversibilité affichées — conforme | Permission `recuperation.manage` OK, erreur gérée, pas de motif applicable | **NOT VERIFIED** — aucune capture reçue | **IN PROGRESS** | `tsc` propre, lecture code complète, 0 test navigateur | Test réel Bryan (clic, double-clic, mobile, erreur réseau) |
| Suppression membre équipe | Niveau 3, `confirmWord=prénom`, conséquences conformes | Permission `equipe.write` + scope BOLA + protection compte principal OK | **NOT VERIFIED** — aucune capture reçue | **IN PROGRESS** — bug corrigé le 17/08/2026 (`await` ajouté), `tsc`+`build` propres, **non re-testé réellement** | Lecture directe `EquipeTab.tsx:657` (corrigé) | Test réel Bryan avant CLOS |
| Suspendre institution (admin) | Niveau 2, motif obligatoire conforme **dans le panneau détail** ; bouton liste corrigé | Permission `institutions.manage` OK, motif requis (400 sinon), transmis à la notification | **NOT VERIFIED** — aucune capture reçue | **IN PROGRESS** — bouton mort corrigé le 17/08/2026, **GAP DE PÉRIMÈTRE persistant** (`app/admin/page.tsx:502`, non migré, hors scope Phase 2) | Lecture directe `institutions/page.tsx:187` (corrigé) + `app/admin/page.tsx:502` (doublon toujours non migré) | Test réel Bryan avant CLOS ; décision Bryan sur le doublon `app/admin/page.tsx` |
| Déconnexion tous les appareils | Niveau 1, nombre d'appareils + réversibilité affichés, `await` correct | Authentification OK, **aucun `can()`** (gap déjà connu, séparé) | **VERIFIED — MANUAL BROWSER TEST** (capture reçue, affichage confirmé — clic non confirmé) | **VERIFIED (affichage) / GAP séparé non résolu (backend)** — pas CLOS au sens strict (gap sécurité toujours ouvert) | 1 capture navigateur réelle + lecture code | Confirmer le clic réel (résultat post-action) ; décision Bryan sur le gap de permission (11.3, inchangé) |

**Aucune ligne n'est CLOS.** Deux migrations ont un bug confirmé par
lecture directe du code (pas une hypothèse), une n'a aucune preuve de test
réel, une a une preuve partielle (affichage uniquement, pas le résultat de
l'action). Le protocole de clôture (section 7, GO CEO du 16/08/2026) exige
un test réel complet avant CLOS — condition non remplie pour les 4.

---

## PHASE 2 — FINAL VALIDATION

**Tests exécutés** :
- Lecture intégrale du code des 4 migrations (UI + route API) — complète
- `npx tsc --noEmit` sur l'ensemble du projet — complet, exit 0
- `npm run build` — lancé, résultat en attente (voir 11.6.5, à compléter dès disponible)
- Recherche exhaustive `window.confirm()` sur tout le dépôt — complète
- Comparaison de 1/3 captures annoncées avec le comportement attendu — complète pour la capture reçue

**Tests réussis** :
- `tsc --noEmit` : 0 erreur
- Migration #4 (Déconnexion appareils) : affichage UI conforme confirmé par capture réelle
- Backend des 4 actions : permissions, motifs obligatoires, gestion d'erreur — tous conformes à la lecture directe du code
- Aucun nouveau `window.confirm()` ni pattern divergent introduit par ce lot

**Tests non exécutés** :
- Clic réel "Confirmer" pour les 4 actions (résultat post-action, succès/erreur API) — sauf affichage pré-clic de la migration #4
- Double-clic, navigation clavier, comportement mobile, session expirée, permission insuffisante — aucun testé en conditions réelles
- Captures "Suppression membre équipe" et "Suspension institution" — non fournies
- Re-test réel des 2 correctifs appliqués (17/08/2026) — non fait, vérifiés par lecture/compilation uniquement

**Bugs trouvés** (cette session, par lecture directe du code, pas des captures) :
1. **BUG CONFIRMED** — `EquipeTab.tsx:657` : `onSupprimer(membre.id)` appelée sans `await` dans `onConfirm` de la `ConfirmModal` de suppression de membre — neutralise la protection anti-double-soumission et l'état de chargement pour cette action précise.
2. **BUG CONFIRMED** — `institutions/page.tsx:187` : bouton d'action rapide "Suspendre" de la vue liste ouvre un panneau (`panel==='suspendre'`) qui n'existe pas — bouton mort, aucune action possible depuis ce point d'entrée.

**Bugs corrigés** : les 2, sur validation explicite de Bryan (17/08/2026) —
`EquipeTab.tsx:657` (`await` ajouté) et `institutions/page.tsx:187`
(bouton mort réparé). `tsc --noEmit` et `npm run build` propres après les
deux correctifs. **Aucun des deux n'a été re-testé en conditions réelles
navigateur** — le correctif est vérifié par lecture/compilation
uniquement, pas par un nouveau clic observé.

**Risques résiduels** :
- Suppression de membre d'équipe : double-soumission réellement possible en pratique tant que le bug #1 n'est pas corrigé (risque modéré — l'API backend elle-même n'a pas de garde-fou dédié non plus, un second DELETE sur un membre déjà supprimé échouerait proprement en 404/erreur plutôt que de dupliquer un effet, mais l'UX de la modale reste cassée)
- Suspension d'institution : le risque identifié en Phase 1 (section 8.6, "zéro motif collecté") n'est corrigé que sur un des deux points d'entrée du produit (panneau détail) — le dashboard admin (`app/admin/page.tsx`) reste exactement dans l'état trouvé en Phase 1
- Déconnexion tous appareils : gap de permission backend toujours ouvert (rappel : tout membre authentifié, pas seulement `equipe.write`, peut déconnecter tous les appareils de l'institution) — inchangé depuis Phase 2, **NOT VERIFIED comme corrigé / GAP DE SÉCURITÉ SÉPARÉ**
- Broadcast : **BUG CONFIRMED IN CODE / CORRECTION HORS PÉRIMÈTRE**, inchangé, non retouché dans cette revue conformément à la consigne

**Décisions CEO nécessaires** :
1. Autoriser (ou non) la correction du bug #1 (`await` manquant, `EquipeTab.tsx`) — correctif d'une ligne, comportement inchangé sinon
2. Autoriser (ou non) la correction du bug #2 (bouton mort, `institutions/page.tsx`) — soit le faire pointer vers `setConfirmSuspendre(true)` (même mécanisme que le panneau détail), soit le retirer si redondant par design
3. Trancher le sort de `app/admin/page.tsx:502` (doublon non protégé) : migrer dans ce même lot P0, ou accepter le risque documenté jusqu'à un chantier d'unification des deux pages (déjà signalé section 4.1/5 comme dette plus large)
4. Confirmer si les 2 captures manquantes (Suppression membre, Suspension institution) seront fournies avant Phase 3, ou si Bryan accepte de démarrer Phase 3 sur d'autres écrans pendant que ces 2 P0 restent `NOT VERIFIED`/`BUG CONFIRMED`
5. Rappel des 2 gaps déjà actés comme séparés, toujours en attente : permission `revoke-all` (11.3) et bug broadcast (8, "Découverte majeure") — aucune décision prise dans cette session, statuts inchangés

**GO / NO-GO Phase 3** :

**NO-GO** pour une clôture complète de la Phase 2 — 2 bugs corrigés mais
**non re-testés réellement**, 2 captures manquantes (Suppression membre,
Suspension institution), gap de périmètre `app/admin/page.tsx:502`
toujours ouvert, gap de permission `revoke-all` toujours ouvert. `tsc`
et `npm run build` propres. Conformément à l'instruction reçue ("NE
COMMENCE PAS encore la migration massive Phase 3"), aucune migration
Phase 3 n'a été engagée dans cette session.

**GO conditionnel et partiel** est cependant possible sans attendre une
clôture à 100% des 4 P0, si Bryan le souhaite : la primitive
`Button`/`ConfirmModal` elle-même est saine (aucun bug trouvé dans les
composants partagés, seulement dans 2 des 8 appelants), donc Phase 3
pourrait démarrer sur des écrans neufs en parallèle de la correction des 2
bugs — décision explicite de Bryan requise avant de le faire (voir
décision CEO #4 ci-dessus), ce document ne tranche pas ce choix.
