# YELEN BUSINESS MOBILE — Périmètre mobile validé par décision CEO

Statut : **Périmètre fonctionnel validé par le CEO (01/10/2026). Aucun code
mobile écrit à ce jour.** Document de référence du chantier (brief CEO,
01/10/2026). Rien dans l'architecture existante n'a été modifié pour
produire cet audit/cette revue — lecture seule (code + schéma de
permissions réels, pas de supposition) du début à la fin du processus.

**Étape du processus** : Audit réel → proposition ingénieur → revue
UX/produit → **décision CEO (atteinte)** → implémentation (pas commencée).
Ce document n'est plus une proposition : la classification §4/§5, la
navigation §6 (Option B + variante comptable) et la revue finale rôle
comptable sont **actées par décision CEO**. Reste à produire :
l'instruction d'implémentation (architecture + design system mobile avant
les écrans), qui est la prochaine étape, pas encore lancée dans ce document.

### Décision CEO — périmètre validé (01/10/2026)
- ✅ Architecture même Yelen / même backend / mêmes données / mêmes APIs (§2)
- ✅ Expérience mobile réellement dédiée (pas un responsive du dashboard PC)
- ✅ Option B comme navigation des 4 rôles standard (§6) :
  `Accueil | Rendez-vous | Clients | Notifications | Profil`
- ✅ Navigation spécifique au rôle `comptable` (§"Revue finale — rôle
  comptable") : `Accueil (finance) | Collaboration | Profil` — même
  produit, même code, pas de second produit ni de nouvel écran
- ✅ Scanner hors navigation principale — action opérationnelle
  contextuelle, pas une destination
- ✅ Scanner conditionné par RBAC (admin/agent uniquement, même matrice que PC)
- ✅ **13 expériences mobiles** (§5) retenues — 9 indispensables (Accueil,
  Rendez-vous, Scanner-action, Messagerie, Collaboration, Mes clients,
  Relation citoyenne, Profil, Notifications) + 4 utiles (Signalements,
  Ma semaine, Clock In Shift, Documents clients) ; fusions et exclusions
  de la revue (§5) actées telles quelles
- ✅ Legal Center réutilisé via Web, jamais dupliqué (§3, §11)
- ✅ Help Center réutilisé via Web, jamais dupliqué (§3, §11)
- ✅ Permissions mobile = mêmes `TAB_MATRIX`/`ACTION_MATRIX` serveur (§9)
  comme source d'autorité unique — aucune deuxième logique RBAC
- ❌ Aucun écran supplémentaire ajouté pour "remplir" une navigation —
  règle appliquée aux 4 rôles standard et à la variante comptable
- ⏳ **Mécanisme visuel exact de l'action Scanner** (FAB / bouton Accueil /
  bouton RDV / barre supérieure / combinaison) — réglé en V1 (§14.3,
  bouton Accueil + bouton RDV, pas de FAB), ouvert à révision ultérieure
- ✅ **Stack technique** : React Native + Expo, un seul codebase TypeScript,
  monorepo `mobile/` dans le même repo (§14.1)
- ✅ **Instruction d'implémentation rédigée** (§14) : design system
  personnalisé iOS (HIG)/Android (Material 3), ordre de phases
  architecture → design system → écrans
- ❌ Aucun code mobile encore écrit — Phase 0 (§14.4) nécessite une
  nouvelle validation explicite de Bryan avant le premier fichier

---

## 1. Contexte

Yelen Business Mobile n'est **pas** un nouveau produit : c'est une nouvelle
expérience mobile du dashboard professionnel Yelen qui existe déjà
(`/{slug}/{id}/{screen}`, ~50 écrans, 163 routes API `app/api/institution/**`).
Même compte, même backend, mêmes données, mêmes rôles, mêmes règles métier.
L'objectif de cet audit : déterminer — à partir du produit réel, pas d'une
liste théorique — quels écrans doivent devenir mobiles natifs, lesquels
restent PC, et avec quelle architecture de navigation.

Population concernée : les **5 rôles `institution_membres`** (admin, agent,
superviseur, comptable, dirigeant — voir `lib/institutionPermissions.ts`).
Les **employés Clock In Shift** (`employees`, population distincte, voir
§13) ont déjà leur propre portail mobile-first (`/clock/{slug}`) — hors
périmètre de ce chantier, qui concerne le personnel qui pilote l'institution
sur Yelen, pas le personnel pointé.

## 2. Architecture

```
Yelen Business Mobile (natif iOS/Android, PWA pendant le dev)
        │  mêmes appels HTTP, même JWT, même payload JSON
        ▼
app/api/institution/**  (163 routes existantes, AUCUNE route mobile dédiée)
        │
        ▼
Supabase (PostgreSQL + Storage) — mêmes tables : institutions,
institution_membres, rdv, paid_bookings, citoyen_documents, employees,
signalements, conversations, push_subscriptions, notifications, journal_activite…
        ▲
        │  mêmes routes API
Dashboard PC (app/[slug]/[id]/layout.tsx, 5949 lignes — référence inchangée)
```

**Authentification réutilisée telle quelle** (`lib/institutionAuth.ts`) :
cookie JWT `yelen224_institution_session`, durée de vie 8h, ligne miroir dans
`institution_sessions` (révocation ciblée possible par membre). 4 méthodes de
connexion existantes produisent ce même JWT : téléphone+OTP (compte
principal), identifiant+mot de passe (membre), PIN, passkey WebAuthn, 2FA
TOTP. **Aucun nouveau système d'auth à créer** — le mobile doit soit (a)
ouvrir le parcours web existant dans une vue web intégrée et récupérer la
session, soit (b) appeler nativement les mêmes routes (`/api/institution/auth/*`)
et stocker le JWT résultant dans le trousseau sécurisé natif (Keychain/
Keystore). (b) est recommandé pour une vraie UX native (clavier numérique PIN,
biométrie du téléphone en façade d'un JWT déjà existant) — détail en §12.

**RBAC réutilisé tel quel** : `TAB_MATRIX`/`ACTION_MATRIX` de
`lib/institutionPermissions.ts` sont la source unique, déjà appelées par les
routes API (pas par le client) — le mobile n'a donc **rien à redéfinir**,
il consomme les mêmes routes qui appliquent déjà la même barrière serveur.

## 3. Inventaire complet de l'existant

48 `TabKey` réels (`lib/institutionPermissions.ts::TAB_KEYS`), regroupés
exactement comme le menu PC les présente aujourd'hui (aucun regroupement
théorique — c'est la nav réelle de `layout.tsx`) :

### Sidebar principale (`navSectionsRaw`)
| Section | Écrans | Composant | Taille |
|---|---|---|---|
| Principal | Vue d'ensemble (`accueil`) | inline dans `layout.tsx` (pas de composant dédié) | — |
| Activité | Messagerie, Rendez-vous, Disponibilités, Services, Valider un RDV | `MessagerieTab`, (rdv inline), `DisponibilitesTab`, `ServicesTab`/`ServicesHotelTab`, `ValiderRdvTab` | 842 / — / 657 / 1288+1425 / 1199 |
| Relation citoyenne | Communication, Yelen Community, Signalements, Scanner QR, Mon code QR | `CommunicationTab`, `CommunauteProTab`, `SignalementsTab`, (scanner inline), `CodeQrTab` | 1464 / 2611 / 1306 / — / 137 |
| Pilotage | Centre d'analyse | `CentreAnalyseTab` | 2009 |
| Finance | Paiements, Transactions, Historique financier, Facturation, Rapports, Documents financiers, Documents clients | `PaiementsTab`, `TransactionsTab`, `HistoriqueFinancierTab`, `FacturationTab`, `RapportsTab`, `DocumentsFinanciersTab`, `DocumentsClientsTab` | 575/454/129/599/471/427/1136 |
| Partenariat | Partenaires, Mes offres | `PartenariatTab`, `MesOffresTab` (+4 sous-composants) | 371 / 810+~440 |

### Panneau "Compte" (`accountItemsRaw`, ouvert au clic sur le nom de l'institution)
| Groupe | Écrans | Composant |
|---|---|---|
| Établissement | Configuration Hôtel*, Documents, Conditions et informations | `ConfigurationHotelTab`, `DocumentsTab`, `ConditionsInformationsTab` |
| Relation client | Mes clients, Avis et réputation, Questions des clients | `MesClientsTab` (743), `AvisReputationTab` (460), `QuestionsClientsTab` (167) |
| Équipe & travail | Équipe, Collaboration, Ma semaine, Espace de travail, Clock In Shift | `EquipeTab` (1081), `CollaborationTab` (1028), `MaSemaineTab` (529), `EspaceTravailTab` (74), `ClockInShiftTab` (3125) |
| Historique | Journal d'activité, Rendez-vous passés | `JournalTab` (975), `RdvPasseTab` (446) |
| Aide | Guide Yelen (modal statique) | — |

*gaté `activite_principale_code === "hotellerie"`.

### Tiroir "Yelen Business" (`YELEN_BUSINESS_SECTIONS`, popover avatar — relation commerciale institution↔Yelen, pas l'argent des clients de l'institution)
Compte Yelen, Contrat Yelen, Forfait Yelen, Moyens de paiement, Transactions,
Réconciliation, Frais & commissions, Facturation, Documents Yelen, Support
Yelen — **10 écrans, données stub** (aucune route/table réelle branchée à ce
jour, confirmé par CLAUDE.md `/modules-livres`).

### Paramètres (éclatés depuis Paramètres unique, 14/09/2026)
Paramètres (racine, liens), Sécurité, Notifications (préférences de canal,
pas un fil), Légal (renvoie vers le Centre légal public), Profil (perso),
Profil responsable, Profil entreprise.

### Hors nav (accès direct, pas dans le menu)
Support Yelen (`SupportYelenTab`, 701 lignes, ticketing — ouvert depuis le
header, URL propre `/{slug}/{id}/support`), Centre de configuration
(`CentreConfigurationTab`, 718 lignes, onboarding post-inscription).

### Ce que le header gère déjà en dehors des tabs (signal fort pour le mobile)
- **Un vrai centre de notifications** (pas seulement des préférences) :
  popover alimenté par `GET /api/institution/notifications`, marquage lu via
  `PATCH`, deux catégories ("Mes notifications" / "Système"), badge de
  non-lus. **Push Web déjà fonctionnel de bout en bout** : abonnement
  (`POST/DELETE /api/institution/push` → table `push_subscriptions`,
  `destinataire_type='institution'`) + envoi réel (`lib/notificationEngine.ts`,
  `web-push`/VAPID, nettoyage auto des abonnements expirés). Aucune route
  mobile à créer pour les data — il manque seulement l'UI plein écran et le
  deep-link vers l'écran concerné.
- **Scanner QR déjà "mobile" en pratique** : `ValiderRdvTab` utilise
  `html5-qrcode` + `getUserMedia({ facingMode: "environment" })`, UI
  "avant/démarrage/actif/refus" déjà pensée caméra (avec un piège iOS Safari
  documenté : ne jamais démarrer la caméra dans un conteneur `display:none`).
  C'est l'écran le plus proche d'un besoin natif déjà présent dans le code web.
- **Aide contextuelle déjà découplée** : chaque écran peut afficher
  `HelpCenterGuide` (`lib/helpCenter/dashboardMapping.ts`) qui ouvre
  `/guide-prestataire/{domaine}/{article}` — Centre d'aide prestataire
  **public**, dans un nouvel onglet. Le Centre légal (`app/(legal)/**`, 5
  documents : CGU, confidentialité, cookies, mentions légales, conditions
  prestataires) est également un groupe de routes public autonome. **Les
  deux sont déjà conçus pour être ouverts depuis n'importe où sans dupliquer
  leur contenu** — exactement le pattern demandé au §4 du brief CEO.

## 4. Matrice Mobile / PC

Classification par capacité réelle (A = mobile indispensable, B = mobile
utile, C = PC uniquement), justifiée par usage réel du schéma/API, pas par
supposition.

| Écran (`TabKey`) | Classe | Justification |
|---|---|---|
| **accueil** (Vue d'ensemble) | **A** | Déjà structuré comme "qu'est-ce qui nécessite mon attention" : 7 KPI, rappels (RDV en retard, compte restreint, nouvelles demandes), prochains RDV, raccourcis. Base idéale du Home mobile — à **recomposer**, pas porter. |
| **rdv** (Rendez-vous) | **A** | Cœur opérationnel quotidien, consulté/agi en permanence. |
| **valider-rdv** (Centre de validation) | **A** | Déjà conçu PC pour un check-in 5-10s (Mission 01) — usage terrain par nature, le mobile est le bon support, pas juste un "nice to have". |
| **scanner** | **A** | Déjà une caméra web (`html5-qrcode`). Cas d'usage mobile le plus évident du produit. |
| **messagerie** | **A** | Conversations citoyen↔institution, besoin de réactivité, badge non-lus déjà dans la nav PC. |
| **collaboration** | **A** | Messagerie interne membre↔membre — équivalent direct des mentions/DM GitHub Mobile. |
| **mes-clients** | **A** | Recherche/fiche client à la volée, hors bureau (agent/superviseur en mouvement). |
| **avis-reputation** | **A** | Répondre vite à un avis négatif est une action à fort enjeu de réputation — comparable à l'app Google Business Profile. |
| **questions-clients** | **A** | Même nature que avis : question publique, réponse rapide attendue. |
| **profil** (profil perso membre) | **A** | Équivalent "Moi" de toute app mobile, trivial à porter. |
| **codeqr** (Mon code QR) | B | Affichage simple, utile en mobilité à l'accueil, non quotidien. |
| **disponibilites** | B | Lecture ("suis-je ouvert, prochain créneau") utile mobile ; **l'édition de règles récurrentes reste PC** (Mission 01 l'a déjà conçue riche-écran). |
| **signalements** | B | Visibilité/triage léger utile en mobilité ; le traitement de dossier (notes, pièces, transitions légales) reste PC. |
| **equipe** | B | Annuaire/état en lecture utile mobile ; gestion des rôles/accès reste PC. |
| **ma-semaine** | B | Rituel personnel hebdo, check rapide possible mobile ; planification réelle reste PC. |
| **clock-in-shift** | B | Vue "qui est présent maintenant" utile en mobilité (superviseur) ; CRUD employés/départements/horaires (3125 lignes) reste PC. |
| **parametres-notifications** | B | Logique de gérer ses préférences de canal depuis l'appareil qui les reçoit. |
| **support** (Support Yelen) | B | Utile de pouvoir répondre à un ticket en déplacement, fréquence faible. |
| **documents-clients** | B | Utile de voir qu'un document attend validation ; vérifier/valider en détail reste PC. |
| **services** / **services-hotel** | C | Catalogue tarifaire — configuration, pas une action quotidienne. |
| **communication** (Annonces) | C | Rédaction longue, médias, planification — PC. |
| **communaute-pro** (Yelen Community) | C | 2611 lignes de composeur/analytics — PC. |
| **analyse** (Centre d'analyse) | C | 2009 lignes de graphiques détaillés — PC ; le Home mobile couvre déjà "l'essentiel maintenant". |
| **paiements / transactions / historique-financier / facturation / rapports / documents-financiers** | C | Opérations financières détaillées, remboursements, exports — PC. |
| **partenariat / mes-offres** | C | Candidature + rédaction d'offres avec médias/analytics — PC. |
| **configuration-hotel / documents / conditions-informations / profil-entreprise / profil-responsable** | C | Formulaires de configuration lourds, peu fréquents. |
| **espace-travail** | C | Tableau de type kanban, écran large nécessaire. |
| **journal / rdv-historique** | C | Consultation d'audit/historique, non urgente. |
| **parametres / parametres-securite / parametres-legal** | C | Paramétrage ponctuel (passkeys, TOTP) — à l'exception du **déverrouillage biométrique de l'app elle-même**, qui est un besoin natif différent (§12), pas cet écran. |
| **yelen-compte / yelen-contrat / yelen-forfait / yelen-paiements / yelen-transactions / yelen-reconciliation / yelen-frais-commissions / yelen-facturation / yelen-documents / yelen-support** | C | Relation commerciale institution↔Yelen — stub aujourd'hui, nature intrinsèquement back-office/légale même une fois réelle. |

## 5. Écrans mobiles retenus — revue détaillée écran par écran (01/10/2026)

*(**Validé par décision CEO le 01/10/2026** — ce n'est plus une
proposition. Reste un cahier des charges d'écrans, pas encore une
architecture/design system mobile, qui est la prochaine étape.)*

Correction préalable : la liste "Indispensables (A)" de la version
précédente comptait en réalité **11** écrans (pas 10 comme résumé plus bas
dans le document) — écart corrigé par cette revue, pas reporté.

Méthode appliquée à chacun des 20 écrans A/B initiaux : lire son RBAC réel
(`TAB_MATRIX`, §4) rôle par rôle, pas juste "combien de rôles y ont accès"
mais "quel rôle concret en a besoin en mobilité" — puis trancher parmi les
4 issues demandées. Deux faits transversaux ressortent de cette lecture et
ont changé plusieurs verdicts par rapport à la proposition initiale :

1. Les rôles qui ont effectivement accès à un écran ne sont pas toujours
   les rôles qui en ont besoin *en mobilité*. Ex. `disponibilites` n'est
   accessible qu'à `admin`/`superviseur` (jamais `agent`) — les deux rôles
   les plus souvent au bureau, pas sur le terrain. Un écran "utile en
   mobilité" doit l'être pour un rôle réellement mobile, pas seulement
   avoir un accès RBAC non nul.
2. **Le comptable est structurellement absent de la bottom nav proposée**
   (§6) — voir l'alerte en fin de section, qui doit être tranchée par le
   CEO séparément de l'inventaire écran par écran.

### A — Mobile indispensable (9 écrans, après fusion de 2)

| Écran | RBAC réel | Verdict |
|---|---|---|
| **Accueil** | contenu différent par rôle (générique admin/superviseur/dirigeant, `FinanceAccueilTab` pour comptable, redirection vers Valider un RDV pour agent) | Indispensable — le mobile doit reproduire ce branchement par rôle, pas un écran unique. |
| **Rendez-vous** | full : admin, agent, superviseur · read : dirigeant · none : comptable | Indispensable. **Absorbe "Valider un RDV"** (voir fusions ci-dessous) — pas 2 écrans. |
| **Scanner** | full : admin, agent uniquement | Indispensable, déjà acté hors bottom nav (§6) comme action contextuelle. **Absorbe "Mon code QR"** (voir fusions). |
| **Messagerie** | full : admin, agent, superviseur · none : comptable, dirigeant | Indispensable — 3/5 rôles, réactivité citoyenne. |
| **Collaboration** | full : **les 5 rôles** | Indispensable — le seul écran métier universel avec Profil/Ma semaine/Support. |
| **Mes clients** | full : admin, agent, superviseur · none : comptable, dirigeant | Indispensable — même schéma que Rendez-vous (3/5). |
| **Relation citoyenne** *(fusion)* | Avis : full admin/agent/superviseur, read dirigeant, none comptable · Questions : full admin/agent/superviseur, none comptable+dirigeant | Indispensable — **fusion Avis & réputation + Questions des clients** en un seul écran à 2 sous-fils (même nature : contenu public qui attend une réponse rapide, RBAC presque identique, déjà groupés en sous-onglets au §6). |
| **Profil** | full : **les 5 rôles** | Indispensable, trivial, universel. |
| **Notifications** | universel sauf **masqué pour `comptable`** dans le header PC actuel (`membreRole !== "comptable"` à la ligne du menu "plus") | Indispensable pour 4/5 rôles — cohérent de garder ce même filtre côté mobile, pas une régression à corriger. |

### B — Mobile utile (4 écrans, après 4 retraits)

| Écran | RBAC réel | Verdict |
|---|---|---|
| **Signalements** | full : admin, superviseur · **read : agent** · none : comptable, dirigeant | Utile confirmé — agent (le rôle le plus mobile) a un vrai accès lecture, pas seulement admin/superviseur. |
| **Ma semaine** | full : **les 5 rôles** | Utile confirmé, renforcé — RBAC universel + conçu explicitly comme un rituel léger (décision CEO 26/09/2026), bon profil mobile. |
| **Clock In Shift (présence live)** | full : admin · read : superviseur, dirigeant · none : agent, comptable | Utile confirmé — 3/5 rôles, cas réel "qui est présent maintenant" pour un superviseur hors bureau. |
| **Documents clients** | full : admin, superviseur uniquement (comptable retiré 16/09/2026) · none : agent, dirigeant | Utile confirmé mais RBAC le plus étroit du lot (2/5) — gardé pour le cas réel de vérification visuelle d'une pièce d'identité en présence du client, pas pour une simple consultation de badge. |

### Fusions actées par cette revue (2)

- **Valider un RDV → fusionné dans Rendez-vous.** Sur PC, c'est un écran
  séparé parce que Mission 01 l'a conçu comme un poste de front-desk dédié
  (recherche/scan/saisie manuelle, grand écran). Sur mobile, l'unité
  naturelle de navigation est "le RDV du jour" avec une action "Confirmer
  la présence" sur l'item — exactement le flow déjà décrit en §7
  ("Rendez-vous : bascule directe vers Scanner si le client est présent").
  Aucune perte de fonctionnalité : l'action existe toujours, juste pas
  comme écran autonome. Même rôles concernés (admin/agent) dans les deux cas.
- **Mon code QR → fusionné dans l'action Scanner/check-in.** Même paire de
  rôles exacte (admin/agent uniquement), même moment opérationnel
  (accueil du client), affichage simple — ne justifie pas un écran séparé
  du flow de check-in dont il n'est qu'une variante (le client scanne le
  code de l'institution plutôt que l'inverse).

### Reclassifiés B → C (3 — retirés du périmètre mobile)

- **Disponibilités** : seuls `admin`/`superviseur` y ont accès — **jamais
  `agent`**, le rôle réellement mobile. Le rôle qui aurait besoin de
  répondre "sommes-nous ouverts maintenant" à un citoyen sur le terrain n'a
  justement pas accès à cet écran. L'intérêt mobile initialement supposé
  ne tient pas à l'épreuve du RBAC réel — retiré, reste PC.
- **Équipe** : accès réel limité à `admin` (full) et `dirigeant` (read) —
  2/5 rôles, et aucun des deux n'est un profil "terrain". La gestion
  d'équipe (rôles, accès, PIN) reste une tâche de configuration PC ; la
  lecture par le dirigeant est un usage occasionnel, pas quotidien — ne
  justifie pas un écran mobile dédié.
- **Préférences de notifications** : ce `TabKey` est en réalité un écran
  de **configuration admin-only** (`parametres-notifications` : `full`
  pour `admin` seul, `none` pour les 4 autres rôles) — pas un réglage
  personnel "activer le push sur mon téléphone". Le besoin mobile réel
  (opt-in push par appareil) est déjà couvert en §12 comme un geste système
  natif (permission OS), pas cet écran de configuration institution-wide.
- *(Support Yelen ne change pas de statut mais change de forme : déjà prévu
  en §6 comme sous-item de l'accès secondaire "Profil", il n'a jamais été
  un écran de bottom nav autonome — retiré de la liste B pour éviter la
  redondance avec §6, sans changer le périmètre réel.)*

### ✅ Rôle comptable — tranché par décision CEO

Fait vérifié ayant motivé l'analyse : 3 des 5 tabs de la bottom nav Option
B sont vides ou masqués pour le rôle `comptable` (Rendez-vous, Clients,
Notifications). Analyse complète, scénarios étudiés et décision finale :
voir la section dédiée **"Revue finale — rôle comptable"** plus bas dans
ce document — navigation spécifique à 3 tabs (`Accueil (finance) |
Collaboration | Profil`) validée par le CEO.

### Bilan chiffré de la revue

19 écrans proposés initialement (après correction du décompte 11+9=20) →
**9 indispensables + 4 utiles = 13 écrans natifs**, 2 fusions de flux
(Valider un RDV, Mon code QR) absorbées dans d'autres écrans, 1 fusion de
paire (Avis + Questions), 3 reclassifiés vers PC uniquement (Disponibilités,
Équipe, Préférences de notifications). **30 écrans restent PC uniquement**
(27 initiaux + ces 3), détail mis à jour en §13.

**Volontairement exclus du mobile** : les 30 écrans C (§13).

## 6. Navigation mobile proposée

**Ne pas reproduire la sidebar.** Bottom navigation à 5 entrées (plafond
GitHub Mobile/Linear/Stripe, cohérent avec les recommandations Apple HIG —
3 à 5 destinations pour une tab bar — et Android Material — 3 à 5
destinations pour une navigation bar compacte).

### Scanner en tab fixe ou en action globale — comparaison sur données réelles

Point soulevé en revue CEO : Apple HIG est explicite, une tab bar sert à
naviguer entre des **sections de contenu**, pas à héberger une **action**.
Le Scanner Yelen (ouvrir la caméra, scanner, confirmer, revenir) est une
action ponctuelle, pas une section qu'on "parcourt" — la question est donc
légitime et tranchée ci-dessous avec une donnée réelle du produit, pas une
préférence esthétique : le RBAC effectif de l'écran Scanner
(`lib/institutionPermissions.ts::TAB_MATRIX`).

| Rôle | Accès `scanner` | Accès `valider-rdv` |
|---|---|---|
| admin | full | full |
| agent | full | full |
| comptable | **none** | **none** |
| superviseur | **none** | **none** |
| dirigeant | **none** | **none** |

Fait vérifié, pas une supposition : **60% des rôles (3 sur 5) n'ont jamais
accès au Scanner ni à Valider un RDV** — c'est exactement la même paire
"front office" déjà identifiée en §4/§5 ("le duo check-in"). Sur PC, cette
réalité est déjà gérée par filtrage de la nav (`navAllowed`/`tabAllowed`) :
un comptable, un superviseur ou un dirigeant ne voit tout simplement pas
ces entrées dans la sidebar. Une bottom nav mobile à 5 cases **fixes et
identiques pour les 5 rôles** reproduirait un problème que le PC a déjà
résolu : une case vide/masquée pour 60% des utilisateurs, dans
l'emplacement de navigation le plus précieux de l'app.

**Option A** — `Accueil | RDV | Scanner | Clients | Notifications`
Avantage : Scanner atteignable en 1 tap depuis n'importe où dans l'app.
Inconvénient réel : pour comptable/superviseur/dirigeant, cette case doit
soit rester vide (gâchis d'un emplacement sur 5, cher en navigation mobile),
soit être remplacée par un autre écran selon le rôle — ce qui veut dire que
la bottom nav n'est **plus un seul schéma unique**, mais 2 schémas
différents à maintenir (un de plus que prévu). Contredit aussi directement
la règle Apple HIG citée en revue (action logée dans une section).

**Option B** — `Accueil | RDV | Clients | Notifications | Profil`, Scanner
en **action opérationnelle contextuelle**, rendue conditionnellement pour
admin/agent uniquement — même principe déjà présent dans le code PC pour
"Mes offres", visible seulement si `partenaire_statut === "approuve"`, ou
"Configuration Hôtel", visible seulement si
`activite_principale_code === "hotellerie"`. Cohérent avec le flow déjà
décrit en §7 ("Rendez-vous : bascule directe vers Scanner si le client est
présent") : Scanner est déclenché *depuis* un contexte (RDV, Accueil), pas
une destination qu'on visite à froid — un comportement d'action, pas de
section. Ne consomme pas un emplacement fixe inutilisable pour 3 rôles
sur 5.

**Recommandation : Option B.** Décisif sur deux faits produits réels, pas
une préférence : (1) le RBAC existant exclut 60% des rôles du Scanner, ce
qui rend une case fixe structurellement inéquitable/gaspillée à l'échelle
de l'app ; (2) le propre flow déjà documenté en §7 montre que Scanner est
toujours atteint *depuis* un autre écran (RDV, Accueil), jamais comme un
point de départ — exactement le comportement d'une action globale, pas
d'une section de navigation. `Profil` prend la 5ᵉ place : section réelle
(pas une action), identique pour les 5 rôles (contrairement à Scanner),
et nécessaire comme point d'entrée vers les écrans secondaires ci-dessous.

1. **Accueil** — Home recomposé (§4)
2. **Rendez-vous** — liste + bascule rapide vers Valider un RDV (même geste,
   action la plus fréquente de la journée pour admin/agent)
3. **Clients** — Mes clients + Avis/Questions regroupés en sous-onglets
   (même "relation citoyenne" que la sidebar PC, juste condensé)
4. **Notifications** — le fil réel (nouveau), badge de non-lus natif sur
   l'icône de l'app
5. **Profil** — identité du membre + point d'entrée des accès secondaires

**Scanner** — hors bottom navigation, rendu uniquement pour `admin`/`agent`
(même garde RBAC que PC). **Décision CEO actée (01/10/2026)** : seul le
principe est tranché à ce stade — *"Scanner n'est pas une destination de
navigation principale, c'est une action opérationnelle contextuelle,
disponible uniquement aux rôles autorisés."* Le **mécanisme visuel exact
reste ouvert**, à trancher en revue UX/ingénierie (pas par ce document) :
bouton d'action flottant, bouton prominent sur Accueil, bouton dans
Rendez-vous, bouton de barre supérieure contextuel, ou combinaison de ces
accès. Ne pas présumer "FAB partout par défaut" avant cette revue.

*(Les deux options restent documentées ci-dessus pour la revue UX/produit —
si un test d'usage réel contredit cette lecture RBAC, par exemple si le
produit évolue vers plus de rôles ayant accès au check-in, la décision est
à rouvrir, pas figée.)*

**Accès secondaire** (depuis l'onglet Profil, pas dans la bottom nav — même
principe que le panneau "Compte" PC) : Messagerie, Collaboration, Équipe,
Clock In Shift (présence), Ma semaine, Signalements, Documents clients,
Disponibilités (lecture), Support Yelen, Préférences de notification, Aide
(→ Centre d'aide prestataire web), Mentions légales (→ Centre légal web),
Déconnexion.

**Barre de recherche** (pattern GitHub Mobile) : accessible depuis Accueil,
cherche à travers clients/RDV — réutilise les routes déjà existantes
(`/api/institution/clients`, `/api/institution/rdv`), pas une nouvelle
recherche.

## Revue finale — rôle comptable (01/10/2026)

Analyse demandée par le CEO sur le point unique resté ouvert après la revue
§5 : le rôle `comptable` n'a d'usage réel que sur une fraction de la
navigation mobile proposée. Lecture exhaustive du RBAC réel
(`lib/institutionPermissions.ts`) + du code des écrans concernés — rien
supposé.

### 1. Constat

Le rôle `comptable` est délibérément isolé du reste du produit depuis le
22/07/2026 (décision CEO documentée dans CLAUDE.md : "le comptable n'est
plus lecteur des écrans des autres rôles... il a son propre espace de
travail"). Ce n'est pas un oubli de conception à corriger — c'est une
séparation de domaine **intentionnelle**, confirmée par le code à trois
endroits indépendants :
1. Son Accueil n'est pas l'Accueil générique mais `FinanceAccueilTab`,
   un composant entièrement différent (`page.tsx` branche sur le rôle).
2. Le centre de notifications PC le masque explicitement
   (`membreRole !== "comptable"` sur l'entrée de menu "Notifications").
3. Son action la plus sensible (`paiements.rembourser`) est protégée par
   un mécanisme dédié (`lib/comptableProtection.ts`) qui **bloque même
   l'admin** tant qu'un comptable actif existe — l'inverse de toutes les
   autres permissions du produit, où admin est toujours le rôle le plus
   large. C'est le signal le plus fort que ce domaine est pensé comme
   spécialisé, pas comme un sous-ensemble du rôle générique.

### 2. Capacités réelles (TAB_MATRIX + ACTION_MATRIX, exhaustif)

**Onglets accessibles (`full`)** : Accueil (variante finance), Services
(catalogue tarifaire), Support Yelen, Paiements, Transactions, Historique
financier, Facturation, Rapports, Documents financiers, Profil,
Collaboration, Ma semaine, et les 10 écrans Yelen Business (Compte,
Contrat, Forfait, Moyens de paiement, Transactions, Réconciliation, Frais
& commissions, Facturation, Documents, Support).

**Tout le reste = `none`** : Rendez-vous, Disponibilités, Valider un RDV,
Communication, Yelen Community, Signalements, Scanner, Mon code QR,
Analyse, Mes clients, Avis & réputation, Messagerie, Questions des
clients, Rendez-vous passés, Équipe, Journal, Espace de travail,
Partenariat, Mes offres, Clock In Shift, Documents clients, tous les
Paramètres détaillés, Profil entreprise/responsable, Documents
institution, Conditions et informations, Configuration Hôtel.

**Actions réellement exécutables** (`ACTION_MATRIX`) : `services.write`
(ajuster les tarifs), `paiements.rembourser` (remboursement — gardé par
ré-authentification + motif obligatoire + journalisation, voir §3),
`facturation.write`, `collaboration.send/create_group/manage_group/
edit_message/delete_message/upload_file` (même périmètre que les 4 autres
rôles), et côté Yelen Business : voir/exporter sur Transactions/
Réconciliation/Frais/Facturation/Documents — **mais jamais** les actions
à plus fort impact de ce même domaine (`cloturer_periode`,
`effectuer_paiement`, `gerer_forfait`, `gerer_remboursements`,
`voir_references_prestataire`, `voir_commissions_yelen`,
`voir_frais_prestataires`, `voir_contrats`), réservées à `admin` seul.

**Données consultées** : paiements/reçus des citoyens (`paid_bookings`),
transactions, rapports de revenus, factures, documents financiers,
catalogue de services/tarifs, et la relation commerciale institution↔Yelen
(stub aujourd'hui). **Aucune donnée relationnelle citoyenne** (pas de nom
de client, pas de RDV, pas de message, pas d'avis) — le comptable voit des
montants et des références, jamais une fiche client.

### 3. Usages mobiles possibles — lecture fine, pas juste "a accès ou pas"

Deux éléments changent la lecture par rapport à une simple colonne RBAC :

- **`FinanceAccueilTab` est un vrai tableau de bord glanceable**, pas un
  rapport PC lourd : bascule Aujourd'hui/Semaine/Mois/Année, 5 KPI (montant
  encaissé, nb paiements, en attente, remboursé, panier moyen), graphique
  journalier, top 5 services, **et une carte "Alertes financières"** déjà
  présente dans le code (`data.alertes`, ex. anomalies de reçus). C'est
  structurellement le même type de signal que les "rappels" de l'Accueil
  opérationnel (§4) — "qu'est-ce qui nécessite mon attention" version
  finance. Vérifier ses chiffres du jour depuis son téléphone est un
  usage mobile aussi naturel qu'une app bancaire — **pas un usage
  inventé pour remplir un slot**, la donnée et le besoin existent déjà.
- **Le remboursement est volontairement à friction élevée** : ré-
  authentification obligatoire (`REAUTH_REQUIRED`), motif texte requis,
  journalisé, et le produit préfère explicitement que ça reste lent et
  tracé plutôt que rapide (c'est littéralement le seul domaine où admin
  est *moins* privilégié que comptable). Rendre cette action rapide sur
  mobile irait **contre** l'intention produit documentée — confirme que
  Paiements/Transactions/Facturation doivent rester PC, pas par défaut
  mais par cohérence avec une décision de sécurité déjà prise.
- **Collaboration, Ma semaine, Profil, Support** sont exactement les mêmes
  écrans, avec le même code, que pour les 4 autres rôles — zéro
  spécificité comptable à construire ici.

Usages mobiles réels : **Accueil (finance)**, **Collaboration**,
**Ma semaine**, **Support Yelen**, **Profil**. Rien d'autre ne tient à
l'examen sans soit casser une protection de sécurité existante
(Paiements), soit inventer une fonctionnalité qui n'existe pas aujourd'hui
(une fiche client ou un RDV que ce rôle n'a jamais eu le droit de voir).

### 4. Scénarios étudiés

**Scénario A — Navigation commune, filtrage RBAC interne.** Rejeté. Le
filtrage RBAC fonctionne quand un écran a un contenu *dégradé* selon le
rôle (ex. Avis en lecture pour `dirigeant`). Ici, il n'y a **aucun
contenu à dégrader** : Rendez-vous, Clients et Notifications ne sont pas
"limités" pour le comptable, ils sont **conceptuellement absents** de son
domaine (zéro donnée relationnelle citoyenne, notifications jamais
construites pour ce rôle). Filtrer ne produit pas une version réduite de
l'écran, ça produit un écran vide — exactement le problème identifié en §5.

**Scénario B — Navigation adaptative, destinations de substitution.**
Partiellement retenu. Remplacer "Rendez-vous"/"Clients"/"Notifications"
par d'autres destinations *réellement* accessibles au comptable ne pose
pas de problème de principe — mais il n'existe **aucune troisième
destination réelle** au-delà de Collaboration/Ma semaine/Support (déjà
prévues en accès secondaire) sans retomber sur la règle interdite n°3
("remettre la Finance détaillée dans l'app juste pour résoudre ce
problème"). Conclusion : le scénario B ne peut substituer que 1 slot
(Collaboration), pas 3 — **pas de solution de substitution complète**.

**Scénario C — Navigation minimale.** Retenu, mais pas au sens d'une app
"appauvrie" : le comptable n'a réellement que **2 destinations de premier
niveau** (Accueil-finance, Profil) + 3 écrans secondaires universels déjà
prévus derrière Profil (Collaboration, Ma semaine, Support). Une bottom
nav à 5 cases forcerait 3 cases vides ; une bottom nav dimensionnée à
l'usage réel n'en a pas besoin. Ce n'est pas "moins bien", c'est
**exactement proportionné aux capacités réelles du rôle** — même logique
que PC, où le comptable voit déjà un menu sidebar réduit à "Finance" sans
que personne n'y lise une régression.

### 5. Recommandation ingénierie/UX

**Bottom nav spécifique au rôle `comptable`, à 3 destinations** :

**Accueil (finance) | Collaboration | Profil**

Justification de chaque choix :
- **Accueil (finance)** — remplace l'Accueil générique (même branchement
  par rôle que sur PC, zéro nouveau composant), déjà glanceable et déjà
  porteur d'un signal d'attention (`alertes financières`).
- **Collaboration** — promue en tab de premier niveau *pour ce rôle
  seulement*, au lieu de rester en accès secondaire comme pour les autres
  rôles : c'est la seule destination "équipe" qu'il lui reste une fois
  Rendez-vous/Clients retirés, et elle est à RBAC universel (5/5 rôles) —
  aucune fonctionnalité nouvelle, juste une position différente dans la
  même IA.
- **Profil** — identique à tous les rôles, point d'entrée vers Ma semaine
  et Support Yelen (déjà prévus en accès secondaire, §6).

**Alternative plus minimale, si 3 tabs semblent encore too much** :
Accueil (finance) | Profil (2 tabs), Collaboration/Ma semaine/Support
restant uniquement accessibles depuis Profil. Les deux variantes sont
défendables ; la version à 3 tabs a la préférence de cette revue parce que
Collaboration est un usage quotidien documenté (chat interne), pas un
réglage occasionnel comme Support ou Ma semaine.

**Explicitement écarté** : ajouter une 4ᵉ ou 5ᵉ destination factice, ou
réintroduire Transactions/Facturation en lecture mobile "pour faire
nombre" — contredirait directement la règle du CEO et la protection de
sécurité documentée en §3.

### 6. Conséquences sur la navigation

Le produit a donc **deux formes de bottom nav**, pas deux applications :
- 4 rôles (`admin`, `agent`, `superviseur`, `dirigeant`) : Accueil | RDV |
  Clients | Notifications | Profil (Option B, §6), avec contenu dégradé
  par rôle à l'intérieur de chaque tab (ex. RDV en lecture pour
  `dirigeant`, Clients masqué pour `dirigeant` — dégradation interne,
  conforme au Scénario A qui, lui, fonctionne pour ces 4 rôles).
- 1 rôle (`comptable`) : Accueil (finance) | Collaboration | Profil —
  même shell applicatif, même code de navigation (un simple `switch` sur
  le rôle au démarrage, pas un second produit), mêmes écrans partagés
  (Collaboration/Profil sont le code strictement identique aux autres
  rôles).

Techniquement : une seule app, un seul design system, une configuration
de bottom nav résolue par rôle au login — pas une build séparée, pas une
deuxième architecture (règle n°4 du CEO respectée).

### 7. Impact sur les 13 écrans retenus (§5)

**Aucun.** Les 13 écrans restent les mêmes — Accueil, Collaboration et
Profil en faisaient déjà partie. Ce qui change est uniquement
**l'arrangement de navigation** pour un rôle, pas l'inventaire d'écrans
natifs à construire. Rendez-vous/Clients/Notifications restent construits
une seule fois, simplement non proposés dans la bottom nav de ce rôle.

### 8. Nouvelles fusions nécessaires

**Aucune.** Pas de nouvel écran, pas de nouvelle fusion : la solution est
entièrement une question d'**arrangement de navigation par rôle**, pas de
contenu. Seule note pour plus tard, explicitement **non retenue pour
cette V1** pour ne pas inventer de fonctionnalité sans besoin vérifié :
l'`alertes financières` déjà présent dans `FinanceAccueilTab` pourrait
un jour nourrir une vraie notification push comptable ("paiement reçu",
"remboursement en attente") — ça n'existe pas aujourd'hui, ça ne doit pas
être construit pour cette raison seule, à réévaluer seulement si un besoin
réel émerge une fois l'app en usage.

---

## 7. Flows principaux

**Rendez-vous** : liste (aujourd'hui/à venir/historique léger) → détail →
actions contextuelles identiques à PC (accepter/refuser/reporter/annuler),
mêmes règles métier (`rdv.write`, statuts incluant `nouveau`) → bascule
directe vers Scanner si le client est présent.

**Scanner** : plein écran dès l'ouverture (pas un bouton "démarrer la
caméra" en plus) → résultat (RDV trouvé/QR invalide) → confirmation → retour
auto à la liste. Réutilise `qr/validate` (déjà appelé en POST depuis le web).

**Client** : recherche → fiche (RDV liés, historique, note privée) →
message direct (ouvre Messagerie filtrée sur ce client) — réutilise
`/api/institution/clients`, `/api/institution/notes-client`,
`/api/institution/messages`.

**Notifications** : fil chronologique (catégories Mes notifications/
Système déjà dans l'API) → tap → deep link vers l'objet concerné (RDV,
avis, question, ticket support) → marquage lu (`PATCH` déjà existant).

**Avis/Questions** : fil des éléments non traités → réponse en 1 écran →
retour au fil, élément retiré.

## 8. Données et APIs — réutilisation vs écart

**100% réutilisable sans adaptation** : toutes les routes listées en §3-4
pour les écrans A/B (`/api/institution/rdv*`, `/clients`, `/messages`,
`/notes-client`, `/notifications`, `/push`, `/avis/repondre`, `/questions`,
`/conversations/**`, `/collaboration/**`, `/signalements/**`,
`/clock-in/attendance`, `/qr/validate`).

**Écart réel identifié** : aucune route n'est "trop lourde" pour mobile au
sens strict (payloads JSON déjà raisonnables, pas de embed PostgREST géant
d'après `/pieges-techniques-connus`) — mais **aucune route n'a de pagination
pensée mobile-first** (scroll infini) sur les écrans à fort volume potentiel
(journal, rdv-historique) ; sans impact V1 puisque ces écrans restent PC.

**Donnée manquante** : aucune table de *device tokens* natifs distincte de
`push_subscriptions` (actuellement Web Push/VAPID, format endpoint/p256dh/
auth). Un push natif iOS/Android (APNs/FCM) a un format différent — à
traiter en §12, pas une nouvelle table métier mais une extension du schéma
`push_subscriptions` ou une table jumelle.

## 9. Permissions

Aucune nouvelle logique : le mobile appelle les mêmes routes, qui vérifient
déjà `ACTION_MATRIX`/`TAB_MATRIX` côté serveur (`can()`/`canAccessTab()`).
Le menu mobile se filtre côté client avec les **mêmes fonctions** déjà
exportées par `lib/institutionPermissions.ts` (`tabAllowed`, `navAllowed`
équivalent) — aucune duplication de matrice à créer. Rappel du rôle `agent`
front-office pur : sur mobile, son Accueil doit pointer directement sur
Valider un RDV, exactement comme PC (`membreRole === "agent" → setTab("valider-rdv")`).

## 10. États (par écran A/B)

Checklist à appliquer systématiquement (identique à l'exigence Mission 01
PC) : loading, empty (ex. "Aucune notification pour l'instant" déjà le
copy PC), error, **offline** (nouveau sur mobile — PC n'a jamais eu besoin de
le traiter explicitement), permission denied (rôle sans accès à l'écran —
ne doit même pas apparaître dans la nav, cf. §9), no data vs success.
Offline en particulier : RDV/Clients/Notifications doivent pouvoir afficher
un **dernier état connu horodaté** plutôt qu'un écran bloquant — scanner et
actions d'écriture (accepter/refuser/répondre) doivent clairement indiquer
"non disponible hors connexion" plutôt que d'échouer silencieusement.

## 11. Deep links / notifications

Chaque notification de `/api/institution/notifications` a déjà un type
implicite (RDV, avis, question, ticket) exploitable pour router vers
l'écran natif correspondant (`yelen224://rdv/{id}`,
`yelen224://avis/{id}`, etc.). Même schéma de deep link à utiliser pour le
push natif (payload JSON déjà `{ titre, message, url }` dans
`notificationEngine.ts` — le champ `url` existe déjà pour le web, à
mapper vers un deep link natif équivalent plutôt qu'une URL web dans l'app).

## 12. Native requirements

- **Caméra** : Scanner QR (remplace `html5-qrcode`/`getUserMedia` par
  l'API caméra native — garder le même contrat `qr/validate`).
- **Push** : APNs (iOS) / FCM (Android) — étendre `push_subscriptions` à un
  second type de token (ou table jumelle), adapter `envoyerPush()` dans
  `lib/notificationEngine.ts` pour dispatcher vers Web Push **ou** natif
  selon le type d'abonnement, sans toucher à la logique métier des 8 phases
  déjà en place.
- **Biométrie** : déverrouillage de l'app (Face ID/empreinte) en façade du
  JWT déjà stocké — ne remplace jamais le passkey WebAuthn PC (sécurité du
  compte), sert seulement de confort d'accès à une session déjà valide.
- **Stockage sécurisé** : JWT `yelen224_institution_session` en Keychain/
  Keystore, jamais en stockage non chiffré.
- **Photos/fichiers** : pièces jointes signalements, documents clients
  (upload déjà en `multipart/form-data` côté API, compatible natif direct).
- **Safe area / clavier** : écrans de connexion (OTP/PIN 4 chiffres déjà en
  usage sur le portail employé `/clock/[slug]`, bon précédent UX à réutiliser
  pour le clavier PIN mobile institution).
- **Deep links** : schéma d'URL custom + Universal Links/App Links pour les
  liens déjà envoyés par email/notification existants.

## 13. Ce qui reste volontairement PC

Les 27 écrans classés **C** en §4, **+ 3 reclassifiés par la revue
écran-par-écran du §5** (Disponibilités, Équipe, Préférences de
notifications — RBAC réel ne justifiant pas un usage mobile, voir §5) =
**30 écrans**, sans exception :
Services/Services Hôtel, Communication (Annonces), Yelen Community, Centre
d'analyse, Paiements, Transactions, Historique financier, Facturation,
Rapports, Documents financiers, Partenariat, Mes offres, Configuration
Hôtel, Documents (institution), Conditions et informations, Profil
entreprise, Profil responsable, Espace de travail, Journal d'activité,
Rendez-vous passés, Paramètres (racine), Paramètres sécurité, Paramètres
légal, **Disponibilités, Équipe, Préférences de notifications**, et les 10
écrans **Yelen Business** (Compte/Contrat/Forfait/Paiements/Transactions/
Réconciliation/Frais/Facturation/Documents/Support Yelen).

**Ne jamais** reconstruire ces écrans en mobile "parce que c'est facile
une fois l'app en place" sans nouvelle décision CEO explicite — c'est
précisément le risque que ce document doit prévenir.

Rappel distinct : le **portail employé Clock In Shift** (`/clock/{slug}`,
PIN 4 chiffres, déjà pensé "kiosque ou téléphone personnel, en quelques
secondes") est un produit mobile-first **séparé**, pour une population
différente (`employees`, pas `institution_membres`). Il n'est pas concerné
par ce chantier mais constitue un précédent UX utile (écran de connexion
PIN, déjà conçu caméra-compatible).

---

## RECOMMANDATIONS INGÉNIERIE

**Écrans à créer sur mobile** : après revue écran par écran (§5), les 9
"A" + les 4 "B" du §5, soit **13 écrans natifs** — pas 48, et moins que les
19 initialement proposés (2 fusions de flux, 1 fusion de paire, 3
reclassifiés PC après lecture du RBAC réel). **Écrans qui restent PC** :
les 30 "C" du §13 — à ne jamais migrer sans nouvelle décision CEO. **Point
ouvert, pas encore tranché** : le rôle `comptable` n'a d'usage réel que sur
2 des 5 tabs de la bottom nav (§5) — décision CEO à prendre entre une app
mobile volontairement minimale pour ce rôle ou une navigation alternative
dédiée.

**Écrans réutilisables directement** : aucun écran React PC n'est
réutilisable tel quel (web responsive ≠ natif, c'est la règle n°1 du brief)
— mais **toutes les routes API** (§8) le sont à 100%, et les deux surfaces
web statiques (Centre légal, Centre d'aide prestataire) se réutilisent par
**lien**, jamais par duplication de contenu.

**APIs à adapter** : aucune en urgence pour V1 (payloads déjà raisonnables) ;
seule extension nécessaire = `push_subscriptions` pour accueillir des tokens
natifs APNs/FCM en plus du Web Push actuel (§12).

**Données manquantes** : un fil de notifications plein écran natif n'a pas
de gap de données (l'API existe), seulement un gap d'UI. Le seul vrai gap
de données identifié est le type de token push natif (§8/§12) — rien côté
métier (RDV, clients, avis) ne manque.

**Composants partagés vs exclusivement mobiles** : partager la **logique**
(mêmes contrats API, mêmes règles de statut RDV via `lib/rdvGating.ts`,
même RBAC `lib/institutionPermissions.ts`) — ne jamais partager les
**composants visuels** React web (`layout.tsx` est un monolithe de 5949
lignes pensé souris/grand écran, aucun de ses sous-composants n'est
conçu tactile). Design system mobile natif distinct, pas un fork du CSS web.

**Risques techniques** :
1. Dupliquer par erreur la logique de statut RDV (`statut_rdv` + le
   `nouveau` non documenté dans l'enum, voir CLAUDE.md `/schema`) au lieu de
   réimporter les mêmes règles serveur → divergence silencieuse PC/mobile.
2. Pousser une notification native avec un `url` pensé pour le web
   (§11) sans le traduire en deep link natif → notification qui ne mène
   nulle part dans l'app.
3. Stocker le JWT institution en clair côté mobile (vs Keychain/Keystore).
4. Scanner QR mobile qui ne respecte pas le piège déjà documenté (ne jamais
   démarrer la caméra dans une vue cachée) — en natif l'équivalent est de ne
   jamais démarrer la session caméra avant que la vue soit réellement au
   premier plan.

**Problèmes UX actuels transposés tels quels au mobile** :
le panneau "Compte" PC (clic pour ouvrir un sous-menu) n'a pas d'équivalent
tactile naturel à la même profondeur — d'où la recommandation §6 de
l'aplatir en un seul accès secondaire par icône profil, pas une copie du
panneau empilé.

**Navigation recommandée** : bottom nav à 5 entrées — Accueil/RDV/Clients/
Notifications/Profil (§6, Option B). Scanner hors bottom nav, en action
opérationnelle contextuelle conditionnée au RBAC (admin/agent seulement) —
principe acté par le CEO, tranché sur le RBAC réel (60% des rôles sans
accès Scanner) et non sur une préférence esthétique. **Le mécanisme visuel
précis de cette action (FAB, bouton Accueil, bouton RDV, barre supérieure,
ou combinaison) n'est pas encore décidé** — à trancher en revue
UX/ingénierie séparée, ce document ne doit pas être lu comme figeant un
FAB par défaut. Pas de sidebar réduite, pas de tiroir hamburger en écran
principal (le tiroir reste pour les écrans secondaires uniquement, comme PC
le fait déjà pour "Yelen Business").

**Parcours prioritaires (V1)** : Scanner + Valider un RDV (le duo
check-in), Rendez-vous, Notifications, Mes clients. Ce sont les 4 flows qui
correspondent le plus directement à "qu'est-ce qui nécessite mon attention
maintenant" et qui ont déjà le plus de matière serveur prête.

**Connectivité faible/intermittente** : Accueil et Rendez-vous doivent
pouvoir afficher un dernier état connu horodaté (§10) ; Scanner et toute
action d'écriture doivent échouer explicitement hors ligne plutôt que
silencieusement.

**Push nécessaires** : nouvelle demande de RDV, RDV en retard non traité,
nouvel avis/question, nouveau message (messagerie/collaboration) — tous
déjà couverts côté moteur (`lib/notificationEngine.ts`), il manque
seulement le canal natif (§12).

**Deep links nécessaires** : RDV, avis, question, ticket support,
conversation — un par type de notification existant (§11).

**Sécurité à renforcer pour mobile** : stockage JWT sécurisé natif, biométrie
de déverrouillage d'app (pas de remplacement du passkey compte), et
réflexion explicite sur la révocation à distance d'un appareil mobile perdu
(`institution_sessions` permet déjà une révocation par session/membre —
à exposer dans Paramètres sécurité PC comme "Appareils connectés", pas une
nouvelle brique).

**Stratégie de synchronisation PC/Mobile** : aucune synchronisation
dédiée à construire — PC et Mobile lisent/écrivent la même base via les
mêmes routes API en temps réel (pas de cache local faisant autorité côté
mobile au-delà d'un dernier état connu pour l'offline, §10). Le seul état
réellement partagé à surveiller est le badge de non-lus (RDV en attente,
messagerie) déjà calculé côté PC (`rdvsPending.length`, `messagerieUnread`)
— à recalculer côté mobile depuis les mêmes routes, jamais par un total
poussé séparément qui pourrait diverger.

---

## 14. INSTRUCTION D'IMPLÉMENTATION — Architecture mobile & design system

Périmètre fonctionnel validé (§1-13 + Revue finale comptable). Cette
section ouvre la phase suivante : **architecture + design system mobile
d'abord, les écrans ensuite** — jamais une conversion responsive du
dashboard PC (règle CEO explicite). Niveau d'exigence : Enterprise/US —
même standard que la Mission 01 PC (Stripe/Notion/Shopify/GitHub), traduit
en conventions natives, pas en CSS web redimensionné. Aucun code encore
écrit — ceci est la spécification qui le précède.

### 14.1 Stack technique retenue

**React Native + Expo (managed workflow, EAS Build)** — décision CEO
01/10/2026. Justification : un seul codebase TypeScript, même langage que
tout le reste de Yelen224 (`app/**`, `lib/**`) — zéro nouvelle compétence à
acquérir en solo ; couvre le besoin "PWA pendant le développement" du
brief d'origine (Expo Web) tout en produisant de vraies apps natives
iOS/Android en sortie (EAS Build) ; écosystème de modules natifs mûr pour
chaque besoin déjà identifié en §12 (caméra, push, biométrie, stockage
sécurisé, deep links).

| Besoin (réf. §12) | Librairie | Notes |
|---|---|---|
| Navigation | `@react-navigation/native` + `bottom-tabs` + `native-stack` | `native-stack` = vraies transitions UIKit/Fragment natives, pas du JS animé |
| Auth / JWT | `expo-secure-store` | Keychain (iOS) / Keystore (Android) automatique, jamais `AsyncStorage` pour le JWT |
| Appels API | `@tanstack/react-query` + `fetch` natif | Mêmes 163 routes `app/api/institution/**`, aucune nouvelle route |
| Caméra / Scanner | `expo-camera` (`CameraView`, scan de codes-barres intégré) | Remplace `html5-qrcode`, même contrat `qr/validate` (§7) |
| Push natif | `expo-notifications` | Abstrait APNs/FCM — étend `push_subscriptions` (§8/§12), ne remplace pas `lib/notificationEngine.ts` |
| Biométrie | `expo-local-authentication` | Déverrouillage d'app, jamais un second facteur compte (§12) |
| Deep links | `expo-linking` + Universal Links (iOS) / App Links (Android) | Schéma détaillé en §11 |
| Safe area | `react-native-safe-area-context` | Obligatoire sur chaque écran, notch/Dynamic Island/barres système |
| Haptique | `expo-haptics` | Abstraction correcte : iOS = `UIFeedbackGenerator`, Android = `Vibrator`/`HapticFeedbackConstants` — jamais appelée à l'identique des deux côtés (§14.2) |
| Blur (iOS) | `expo-blur` | Tab bar translucide iOS — n'a pas d'équivalent Android, ne pas l'utiliser côté Android (§14.2) |

**Ce qui ne change pas** : les 163 routes API, `lib/institutionPermissions.ts`
(RBAC), `lib/rdvGating.ts` (règles de statut RDV) restent l'unique source
de vérité serveur. Le mobile ne réimplémente aucune règle métier — il
appelle les mêmes routes et affiche ce qu'elles renvoient (§9 inchangé).

**Structure de dépôt** : l'app mobile vit dans `mobile/` à la racine du
même repo `yelen224` (pas un second repo) — un seul historique Git, un
seul endroit où une PR touche à la fois l'API et son usage mobile si
besoin. `npm workspaces` pour que `mobile/` et le reste du repo partagent
`node_modules` sans dupliquer les dépendances communes (pas de monorepo
Nx/Turborepo complexe — inutile pour 2 packages).

### 14.2 Design system mobile — personnalisation réelle par plateforme

**Principe directeur, à ne jamais violer** : un seul jeu de **tokens de
marque** (couleur, typographie de marque, iconographie), mais des
**composants et interactions distincts par plateforme** là où iOS et
Android ont des conventions différentes. Ce n'est pas repeindre le même
écran en deux couleurs de système — c'est deux implémentations du même
écran, chacune fidèle à sa plateforme. C'est exactement ce que fait GitHub
Mobile, cité dans la revue CEO précédente, et ce qu'Apple/Google demandent
explicitement dans leurs guidelines respectives.

#### Tokens partagés (jamais dupliqués, un seul fichier `mobile/src/theme/tokens.ts`)
- **Couleur de marque** : `C.gold = #F5A623` — identique à `theme.ts` PC,
  **jamais modifié** (règle CLAUDE.md déjà en vigueur, vaut aussi pour mobile).
- **Palette sémantique** : mêmes rôles que PC (`t1/t2/t3`, `bg`, `border`,
  `green/red/orange/blue`) en light **et** dark — le mobile doit supporter
  le mode sombre système dès V1 (`useColorScheme()`), pas un chantier séparé.
- **Iconographie** : un seul set vectoriel (outline, cohérent avec les SVG
  déjà dessinés pour la sidebar PC — même esprit graphique, pas un set
  générique type "Font Awesome"), rendu nativement de part et d'autre.
- **Logo/wordmark Yelen** : seul endroit où `Plus_Jakarta_Sans` (police de
  marque PC) apparaît sur mobile — pas sur le texte d'interface (§ci-dessous).

#### iOS — conventions Apple HIG
- **Typographie d'interface** : police système (SF Pro), **pas Jakarta**
  — HIG déconseille explicitement de combattre la police système sur les
  écrans d'usage quotidien ; support de Dynamic Type (tailles de texte
  accessibilité) obligatoire.
- **Navigation** : tab bar native translucide (`expo-blur` +
  `BlurView`), grands titres (`largeTitle`) sur les écrans de liste
  (Rendez-vous, Notifications) qui se réduisent au scroll — pattern HIG
  standard, pas une réinvention.
- **Transition d'écran** : swipe-back au bord gauche natif
  (`native-stack` le fournit automatiquement) — ne jamais le désactiver,
  c'est un réflexe moteur iOS.
- **Modales/feuilles** : présentation `sheet` (glisse depuis le bas, coins
  arrondis, `drag to dismiss`) pour les actions courtes (répondre à un
  avis, confirmer un RDV) — jamais une modale plein écran sans poignée.
- **Confirmations destructives** : `ActionSheet` natif (annuler un RDV,
  supprimer un message) — même principe que la règle PC "aucun
  `window.confirm`" (CLAUDE.md), traduite en équivalent natif stylé marque
  plutôt qu'une alerte JS générique.
- **Haptique** : retour léger (`ImpactFeedbackStyle.Light`) sur confirmation
  de scan réussi, retour d'erreur (`NotificationFeedbackType.Error`) sur
  échec — jamais utilisé en Android (voir ci-dessous, convention différente).

#### Android — conventions Material Design 3
- **Typographie d'interface** : police système (Roboto par défaut OEM),
  échelle typographique Material (`headlineSmall`, `bodyMedium`, etc.) —
  même raison qu'iOS : ne pas combattre la police système.
- **Navigation** : bottom navigation bar Material (élévation/ombre portée,
  effet *ripple* au tap) — pas de flou translucide (convention iOS
  uniquement, `expo-blur` non utilisée côté Android).
- **Bouton retour matériel/geste** : le bouton retour système (ou geste
  Android) doit être explicitement géré (`BackHandler`) sur chaque écran
  empilé et sur le Scanner plein écran — contrairement à iOS où le retour
  est toujours un geste in-app, Android attend que le bouton matériel
  fonctionne partout, y compris pour fermer une modale avant de quitter
  l'app. Oubli fréquent et visible immédiatement par un utilisateur Android.
- **Modales/feuilles** : *bottom sheet* Material (courbe d'animation et
  easing différents d'iOS — ne pas réutiliser la même valeur de durée/
  courbe que la feuille iOS, ce serait "un iOS repeint", pas du Material).
- **Confirmations transitoires** : *Snackbar* Material (en bas, avec
  action "Annuler" optionnelle) pour les retours de succès/erreur courts
  — pattern distinct du toast iOS.
- **Haptique** : `expo-haptics` mappe automatiquement vers l'API Android
  correcte — ne jamais appeler un haptique "iOS-style" à la même intensité,
  les deux plateformes ont des conventions tactiles différentes que la
  librairie abstrait déjà correctement si on ne la contourne pas.

#### Ce qui reste strictement identique des deux côtés
Les **données**, les **règles métier**, le **RBAC**, les **routes API**,
l'**architecture de navigation** (§6 : Accueil/RDV/Clients/Notifications/
Profil pour les 4 rôles standard, Accueil-finance/Collaboration/Profil
pour le comptable), et le **sens** de chaque écran. Seule l'implémentation
visuelle/interactionnelle diverge — jamais le contenu ou le comportement
métier.

### 14.3 Scanner — implémentation de l'action contextuelle

Décision déjà actée (§6) : Scanner n'est pas un tab. Implémentation V1,
sans FAB (mécanisme visuel toujours ouvert, §6) :
1. Bouton d'action sur l'écran **Accueil** (rôles admin/agent uniquement,
   même garde RBAC que PC) — accès direct dès l'ouverture de l'app.
2. Bouton contextuel sur chaque **item Rendez-vous du jour** (même
   garde RBAC) — reprend le flow déjà décrit en §7 ("bascule directe vers
   Scanner si le client est présent").
Composant unique `<ScannerAction/>` partagé par ces deux points d'entrée
(pas 2 implémentations), rendu conditionnellement selon le rôle courant —
`return null` si non autorisé, exactement le principe déjà utilisé côté PC
pour "Mes offres"/"Configuration Hôtel" (§6).

### 14.4 Ordre d'implémentation (architecture → design system → écrans)

**Phase 0 — Fondations, zéro écran métier** : bootstrap Expo/TypeScript,
`react-navigation` (squelette des 2 arborescences de nav, §6 + comptable),
`tokens.ts`, auth (appel réel aux routes `/api/institution/auth/*`
existantes, stockage JWT via `expo-secure-store`), thème clair/sombre.
Rien n'est visible côté métier — seule l'app vide avec connexion réelle
fonctionne.

**Phase 1 — Design system** : composants de base en **paire iOS/Android**
(jamais un seul composant à branches `if Platform.OS`) : Bouton, Carte,
Champ de saisie, Feuille modale, Badge, Toast/Snackbar, État vide, État de
chargement, État hors-ligne (§10).

**Phase 2 — Profil** : premier écran métier réel (le plus simple,
universel aux 5 rôles) — valide la chaîne JWT → API → affichage de bout
en bout avant d'attaquer un écran complexe.

**Phase 3 — Accueil (les 2 variantes) + Notifications** : valide le
branchement par rôle (générique vs `FinanceAccueilTab`) et l'extension
push natif de `push_subscriptions` (§8/§12).

**Phase 4 — Rendez-vous + Scanner (action) + check-in** : le flow prioritaire
identifié dans les Recommandations ingénierie (§ plus haut).

**Phase 5 — Clients + Relation citoyenne + Messagerie + Collaboration**.

**Phase 6 — Écrans utiles (B)** : Signalements, Ma semaine, Clock In Shift
(lecture), Documents clients.

**Phase 7 — Durcissement** : les 7 états par écran (§10), offline réel,
deep links (§11), révision finale de la personnalisation iOS/Android
écran par écran (pas seulement sur les composants de base de la Phase 1).

### 14.5 Honnêteté sur les limites de cet environnement

Comme pour l'audit PC (aucun navigateur disponible pour vérification
visuelle, déjà noté à plusieurs reprises dans ce document), **aucun
simulateur iOS, émulateur Android ou appareil physique n'est accessible
dans cet environnement**. Chaque phase ci-dessus devra être testée
réellement par Bryan (Expo Go en dev, puis build EAS pour le rendu final
natif) — ce document spécifie l'implémentation, il ne remplace pas une
vérification visuelle réelle sur les deux plateformes.

---

*Document vivant — mis à jour à chaque décision de périmètre ou
d'architecture prise par le CEO. Statut au 02/10/2026 : périmètre
fonctionnel et stack technique (React Native/Expo) validés, instruction
d'implémentation (§14) rédigée, **Phase 0 codée** (bootstrap Expo/
TypeScript, navigation standard + comptable, `tokens.ts`, auth OTP
écrite contre le contrat réel). Rapport Phase 0 remis au CEO a identifié
2 blocages serveur (JWT uniquement en cookie httpOnly, `getAuthenticatedMembre()`
ne lisait que ce cookie) — **décision CEO (02/10/2026) : correction
serveur minimale autorisée, périmètre strict** (cookie web inchangé,
`Authorization: Bearer` accepté en complément, aucune nouvelle
permission). **Correction livrée le même jour** : `lib/institutionAuth.ts`
(`estAppelMobile()`, `decoderJetonInstitution` accepte `cookie ?? bearer`),
les 5 routes de connexion (`verify-otp`, `pin/verify`, `webauthn/auth-verify`,
`totp/login-verify`, `membre/login`) renvoient le JWT dans le corps JSON
uniquement si l'en-tête `X-Yelen-Client: mobile` est présent (posé par
`mobile/src/api/client.ts`), `mobile/src/auth/session.ts` nettoyé des
commentaires de blocage devenus faux. **Bug trouvé et corrigé en marge** :
`tsconfig.json` racine n'excluait pas `mobile/` — le `tsc --noEmit`
racine englobait les fichiers mobile, cassait leurs alias `@/*` (mappés
pour le repo racine) et polluait le type global `FormData` avec la
déclaration React Native, faisant échouer en cascade de vraies routes web
(`documents`, `signalements`, `upload`, etc. utilisant `request.formData()`)
— `mobile` ajouté à `exclude`, les deux projets (`npx tsc --noEmit` racine
et `cd mobile && npx tsc --noEmit`) repassent à 0 erreur séparément.
**Aucun commit/push effectué** (règle CLAUDE.md — jamais sans ordre
explicite de Bryan pour ce commit précis). **Non vérifiable dans cet
environnement** : test réel du flow de connexion sur simulateur/appareil/
Expo Go — à faire par Bryan avant la Phase 1. Prochaine étape : passage
de la checklist de vérification du CEO (web non régressé, mobile de bout
en bout, pas de contournement RBAC) par Bryan, puis validation explicite
avant la Phase 1 (§14.4, design system mobile).*

**Angle mort comblé le 05/10/2026** : ce document ne traitait d'aucun cas
"jamais inscrit" (§1-14 supposent toujours un `institution_membres`
existant) — l'écran de connexion mobile n'offrait donc aucune issue à une
institution sans compte. Décision : **pas de flux d'inscription natif**
(éviterait de dupliquer `app/institution/inscription/SignupEngine`, règle
n°1 du brief CEO) — un lien "Pas encore de compte ? → Ouvrir le site" sur
`mobile/src/app/(auth)/login.tsx` ouvre `webUrl("/institution/inscription")`
dans le navigateur natif in-app (`expo-web-browser`, même pattern que
`ProfilScreen`/`AProposSheet`, §6/§11 — jamais `Linking.openURL`). Zéro
nouvelle route, zéro nouvel écran, zéro logique métier dupliquée.

**Révision de périmètre le 05/10/2026 (décision CEO) — "Profil entreprise"
repasse de C (PC uniquement, §4/§13) à mobile, sous-ensemble réduit.**
Motivation : un professionnel a besoin de mettre à jour les infos de son
établissement n'importe quand, l'accessibilité mobile est un vrai avantage
(référence produit citée : profil d'établissement WhatsApp Business) — pas
une reconstruction "parce que c'est facile", une vraie décision CEO comme
l'exige §13.

- **Périmètre volontairement réduit** par rapport à `ProfilEntrepriseTab.tsx`
  (869 lignes, PC) : identité (nom, description, logo), contact (téléphone,
  WhatsApp, email, site web), adresse (ville, quartier, adresse complète),
  horaires (édition simple jour par jour, pas le moteur de règles
  récurrentes). **Reste explicitement PC uniquement** : statut juridique,
  taxonomie catégorie/activité, wizard société étrangère, bannière,
  latitude/longitude (carte) — formulaires lourds, peu fréquents, non
  revus par cette décision.
- **Même route serveur, aucune nouvelle route** : GET/PUT
  `/api/institution/profile` (déjà utilisée par le PC) — le PUT est
  partiel par champ (`if (!(field in body)) continue`), envoyer seulement
  ce sous-ensemble ne risque jamais de vider un champ PC-uniquement.
  Upload logo via la route existante `/api/institution/upload`
  (`kind: "logo"`, action `profil_entreprise.write`) — **premier appel
  d'upload multipart du mobile**, `mobile/src/api/client.ts::uploadFile()`
  ajouté à côté de `apiRequest()` (JSON) pour cette raison.
- **RBAC transcrit tel quel** : `profil-entreprise` est `full` pour
  `admin` et `none` pour les 4 autres rôles dans `TAB_MATRIX` — l'item
  "Entreprise" de l'accès secondaire du Profil mobile (nouveau groupe
  "Établissement", `mobile/src/lib/profilAccesSecondaire.ts`) est donc
  visible **admin uniquement**, même filtre cosmétique que le reste de ce
  fichier, la vraie barrière reste serveur.
- **Nouvelle dépendance** : `expo-image-picker` (sélecteur photo natif
  pour changer le logo) — à installer par Bryan
  (`cd mobile && npx expo install expo-image-picker`), config plugin déjà
  ajoutée à `app.json`. `expo-image` (déjà présente) réutilisée pour
  l'aperçu du logo.
- **Non vérifié dans cet environnement** (aucun simulateur/appareil) : le
  flow réel de sélection/upload de logo, et le rendu de l'écran sur les
  deux plateformes — à faire par Bryan avant de considérer ce lot terminé.

**Phase 5 (§14.4) — "Relation citoyenne" livrée le 12/10/2026, Messagerie/
Collaboration restent en `PlaceholderScreen`.** L'onglet "Clients" de la
bottom nav fusionne désormais Mes clients + Avis + Questions en 3 sous-
onglets, exactement comme décrit en §5/§6/§7 — libellé de tab inchangé
("Clients"), seul le contenu de l'onglet change.

- **`@expo/ui/community/segmented-control` consommé pour la première fois**
  (dépendance présente depuis Phase 0, jamais utilisée jusqu'ici) — vrai
  `Picker` SwiftUI (`pickerStyle: 'segmented'`) sur iOS, vrai
  `SingleChoiceSegmentedButtonRow` Jetpack Compose Material 3 sur Android
  (vérifié dans `node_modules/@expo/ui/src/community/segmented-control/*`,
  aucun des deux n'est un composant JS repeint) — exactement la
  personnalisation réelle par plateforme exigée en §14.2.
- **`ClientsScreen.tsx` inchangé**, simplement rendu comme 1 des 3 segments
  par le nouveau `RelationCitoyenneScreen.tsx` (segment par défaut) — zéro
  régression sur l'écran Clients déjà réglé par les retours Bryan du
  04/10/2026.
- **Avis** (`AvisScreen.tsx`/`useAvis.ts`) : même route que
  `AvisReputationTab.tsx` PC (`GET avis-reputation/liste`, `POST
  avis/repondre`), aucun nom de citoyen affiché (la route ne le joint pas,
  même côté PC — pas une omission mobile). RBAC réel transcrit tel quel :
  bouton Répondre masqué pour `dirigeant` (accès `read` côté serveur), la
  liste reste visible en lecture.
- **Questions** (`QuestionsScreen.tsx`/`useQuestions.ts`) : même route que
  `QuestionsClientsTab.tsx` PC. ⚠️ Angle mort serveur repéré en lisant la
  route (pas corrigé, hors périmètre sans validation explicite, voir
  CLAUDE.md) : `GET /api/institution/questions` n'est gardé par aucun
  `canAccessTab`/`can()` — seul le `PATCH` (répondre) l'est
  (`questions.repondre`). Le mobile reflète donc le même comportement que
  PC : la liste reste visible même pour un rôle sans accès nominal à ce
  sous-onglet, seul le bouton Répondre est masqué côté client.
- **`TabHeaderStack.tsx`** : nouveau prop optionnel `headerTransparent`
  (défaut `true`, inchangé pour Accueil/Rendez-vous/Notifications/Profil),
  posé à `false` uniquement pour Clients — un header transparent flotte en
  position absolue au-dessus du contenu, ce qui aurait caché le
  `SegmentedControl` fixe sans un calcul d'inset dédié ; un header opaque
  réserve sa hauteur dans le flux normal, aucun calcul nécessaire.
- **2 nouvelles illustrations d'état vide** (`EmptyIllustration.tsx`) :
  "avis" (étoile) et "questions" (bulle "?"), même langage que les
  variants existants — "rien à répondre" n'a pas vocation à réutiliser la
  cloche de Notifications (domaine différent).
- **Pas de recherche sur Avis/Questions** (contrairement à Clients) — le
  flow de référence (§7, "fil des éléments non traités") n'en demande pas,
  rien inventé au-delà. Filtre "À répondre / Tous" seul, même mécanique
  que les pills de Clients.
- **Non vérifié dans cet environnement** (aucun simulateur/appareil) :
  rendu réel du `SegmentedControl` natif sur les deux plateformes, et le
  flow complet répondre→retour au fil — à faire par Bryan.

**Reste en Phase 5** : Messagerie, Collaboration (toujours
`PlaceholderScreen`). **Phase 6 (B)** : Signalements, Ma semaine, Clock In
Shift (lecture), Documents clients — tous `PlaceholderScreen`. **Phase 7**
pas commencée.

**Bug réel trouvé et corrigé le 12/10/2026 — 2FA TOTP absente du flow de
connexion mobile.** Bryan a signalé ne pas pouvoir entrer dans l'app
("code incorrect alors que c'est le bon") sur un compte avec la 2FA TOTP
activée. Diagnostic confirmé par lecture du serveur : quand
`institution_membres.totp_enabled` est vrai, `verify-otp/route.ts:168-177`
renvoie `{requiresTotp:true, totpToken}` (200, sans `token` de session) —
le code OTP téléphone est déjà consommé/supprimé à ce stade (ligne
121-123, avant le test TOTP). L'ancien `session.ts::verifyOtp()` ne
connaissait que `{success, token}` : il traitait ce cas comme une erreur
générique sans jamais proposer d'étape TOTP, et retaper le même code OTP
échouait à raison (déjà consommé) — d'où la confusion "le bon code dit
incorrect".

- **`session.ts`** : `verifyOtp()` renvoie désormais `VerifyOtpOutcome`
  (`{requiresTotp:true, totpToken}` ou `{requiresTotp:false, session}`)
  au lieu de toujours finaliser la session. Nouvelle fonction
  `verifyTotp(totpToken, code)` — même route que le web
  (`totp/login-verify`, déjà prête côté serveur pour mobile depuis le
  02/10/2026, `estAppelMobile()` renvoie déjà `token` dans le corps JSON,
  **zéro changement serveur nécessaire**).
- **`SessionProvider.tsx`** : `verifyOtp()` ne positionne `status:
  "authenticated"` que si `requiresTotp` est faux ; nouvelle méthode de
  contexte `verifyTotp()`.
- **`otp.tsx`** : si `requiresTotp`, navigue vers la nouvelle route
  `/(auth)/totp` au lieu de laisser Stack.Protected attendre un
  changement de statut qui n'arrivera jamais.
- **`totp.tsx`** (nouveau) : saisie du code (clavier numérique 6
  chiffres) + bascule "Utiliser un code de secours" (champ texte libre) —
  même toggle que le web, purement visuel (le serveur essaie TOTP puis
  codes de secours automatiquement sur le même champ `code`). Pas
  d'auto-soumission à 6 chiffres (contrairement au web) : l'écran OTP
  téléphone mobile existant n'auto-soumet pas non plus, convention mobile
  cohérente plutôt qu'un copier du comportement web.
- **Non vérifié dans cet environnement** (aucun simulateur/appareil) : le
  flow réel bout en bout sur un compte 2FA — à confirmer par Bryan.

**Phase 5 clôturée le 12/10/2026 — Messagerie et Collaboration livrées.**
Les 13 écrans retenus (§5) + Entreprise (extension §ci-dessus) sont tous
sortis du `PlaceholderScreen`.

- **Messagerie** (`MessagerieScreen.tsx`/`ConversationDetailScreen.tsx`/
  `useConversations.ts`) : boîte de réception (pills Toutes/Non lues/En
  attente) + fil + envoi texte, même route "V2" (`conversations`) que
  `MessagerieTab.tsx` PC. Images **reçues** résolues en URL signée via
  `/api/institution/messages/image-url` (route déjà prête, 1 appel en lot
  seulement s'il y a des images). **Volontairement hors V1** : envoi
  d'image (la route existante attache l'image à un `rdv_id`, pas un
  `conversation_id` — contrat différent, pas réutilisable sans décision
  produit), fermer/réouvrir/assigner une conversation.
- **Collaboration** (`CollaborationScreen.tsx`/`CollaborationThreadScreen.tsx`/
  `useCollaboration.ts`) : liste des conversations internes (DM + groupes)
  + fil + envoi texte, même route que le module Collaboration PC.
  **Volontairement hors V1** : créer un DM/groupe (nécessiterait un
  sélecteur de collègues, même décision de report que le "Lot D" de
  Clients), réactions, fils de réponse, pièces jointes, @mentions — le
  cœur "lire et répondre" est couvert, le reste est une fonctionnalité PC
  avancée, pas un manque silencieux.
- **Même écran, deux montages** (§6 "Revue finale rôle comptable") :
  `CollaborationScreen`/`CollaborationThreadScreen` sont rendus à la fois
  en route poussée (`(business)/collaboration` + nouvelle route
  `collaboration-conversation/[id]`) et en tab de premier niveau
  (`(comptable)/(tabs)/collaboration/` + `(comptable)/
  collaboration-conversation/[id]`) — un seul code, juste monté
  différemment, navigation branchée par rôle (`estComptable`, même
  principe que `ProfilScreen.tsx::ma-semaine`/`support-yelen`).
- **Bug de scaffolding Phase 3 trouvé et corrigé en passant** :
  `(comptable)/(tabs)/collaboration.tsx` était un fichier plat sans son
  propre `_layout.tsx` (contrairement à `index`/`profil`, qui en ont un)
  — cette tab n'avait donc jamais eu de header natif. Converti en dossier
  `collaboration/_layout.tsx` + `collaboration/index.tsx`, même patron que
  les 2 autres tabs comptable.
- **Non vérifié dans cet environnement** (aucun simulateur/appareil) : le
  rendu réel des deux fils de discussion et la navigation comptable vers
  le fil Collaboration — à faire par Bryan.

**Bilan Phase 5** : 13 écrans natifs + Entreprise, tous réels. **Reste
sur la roadmap** : Phase 6 (Signalements, Ma semaine, Clock In Shift
lecture, Documents clients — tous `PlaceholderScreen`), Phase 7
(durcissement : 7 états par écran, offline réel, deep links, revue finale
iOS/Android).

**Phase 6 clôturée le 12/10/2026 — les 4 écrans B (utiles) livrés, tous
en lecture quasi totale, conforme à la classification §5 ("le traitement
détaillé reste PC").**

- **Signalements** (`SignalementsScreen.tsx`/`useSignalements.ts`) :
  liste (pills Ouverts/Tous) + Sheet de consultation (motif, description,
  citoyen) — zéro action (assigner/notes/transitions), même route que
  `SignalementsTab.tsx`. Labels motif/priorité dupliqués dans
  `lib/signalementLabels.ts` (déjà préparé en amont pour
  `ClientDetailScreen.tsx`, étendu ici).
- **Ma semaine** (`MaSemaineScreen.tsx`/`useMaSemaine.ts`) : "rituel
  léger" — 3 priorités de la semaine (éditables, `preparations_semaine`)
  + tâches du jour (`taches?membre_id=moi`, cocher = terminer), PAS la
  grille 7 jours/replanification/bilan/suggestions du PC (529 lignes).
  **⚠️ Bug serveur repéré, non corrigé (hors périmètre sans validation
  explicite)** : `GET /api/institution/taches` est gardé par
  `canAccessTab(role, "espace-travail")` au lieu de `"ma-semaine"` — le
  comptable a `espace-travail: none` mais `ma-semaine: full`, donc son
  bloc "Tâches du jour" recevra toujours un 403 (déjà le cas sur PC
  aujourd'hui, `MaSemaineTab.tsx` appelle la même route). Les 2 blocs sont
  des requêtes indépendantes côté mobile pour que ce 403 n'affecte jamais
  l'affichage des priorités (qui, elles, fonctionnent pour le comptable).
- **Documents clients** (`DocumentsClientsScreen.tsx`/
  `useDocumentsClients.ts`) : liste (pills À traiter/Tous) + Sheet de
  consultation (description, motif de refus, date limite) — zéro action
  (demander/envoyer/valider/refuser/archiver). RBAC le plus étroit du lot
  (admin/superviseur). Labels dupliqués dans `lib/documentLabels.ts`.
- **Clock In Shift — présence** (`ClockInShiftScreen.tsx`/
  `useClockInAttendance.ts`) : vue "journée en cours" uniquement (KPI
  Présents/Retard/Absent/Congé + liste employés triée par urgence de
  lecture, indicateur hors-zone) — pas le flux temps réel ("Timeline
  Live"), pas l'historique/rapport de période, pas les corrections.
  `clock_in.read_full` (admin/superviseur/dirigeant).
- **Non vérifié dans cet environnement** (aucun simulateur/appareil) :
  rendu réel des 4 écrans, et confirmation en base du comportement
  comptable sur Ma semaine — à faire par Bryan.

**Bilan Phase 6** : les 13 écrans + Entreprise sont tous sortis du
`PlaceholderScreen`. **Reste sur la roadmap** : Phase 7 (durcissement — 7
états par écran, offline réel, deep links, revue finale iOS/Android), et
la décision à prendre sur le bug `taches`/`espace-travail` ci-dessus.

## 12/10/2026 — Avis/Questions (refonte UX), immuabilité des réponses, écran Équipe, revue critique + build

Trois chantiers mobiles enchaînés le même jour, puis une revue critique
complète + build local de bout en bout (demande explicite Bryan,
exécutée en autonomie sans validation intermédiaire).

### A. Refonte UX Avis/Questions (brief Bryan détaillé, "niveau international")

`AvisScreen.tsx`/`QuestionsScreen.tsx` avaient déjà l'essentiel du brief
(hiérarchie carte, Sheet de détail sans troncature, séparation
consultation/réponse par rôle) — seuls 3 ajouts réels :
- Résumé discret sous les onglets (`"{N} avis · {M} à répondre"`, calculé
  depuis les données déjà chargées, jamais de chiffre inventé).
- Compteur sur le filtre "À répondre" (`"À répondre · 4"`).
- Chevron discret sur les cartes sans réponse (affordance d'action, pas
  un bouton supplémentaire qui encombrerait la carte).

### B. Immuabilité des réponses avis/questions (demande Bryan)

Une réponse déjà publiée ne doit plus jamais être modifiable — un client
qui la verrait changer après coup y lirait une manipulation des données.
- **Barrière serveur** (source de vérité, pas seulement l'UI) :
  `app/api/institution/avis/repondre/route.ts` et
  `app/api/institution/questions/route.ts` (PATCH) rejettent désormais
  toute tentative de réponse si `reponse_institution`/`reponse` est déjà
  renseignée — 409 `"Cette réponse est déjà publiée et ne peut plus être
  modifiée."`.
- **Mobile** : `AvisScreen.tsx`/`QuestionsScreen.tsx` ne proposent plus
  jamais de champ d'édition une fois la réponse publiée, pour aucun rôle
  (le PC n'avait d'ailleurs jamais eu ce bouton — le vrai trou n'existait
  que côté mobile).
- **Bug de message d'erreur trouvé en testant** : le 409 ci-dessus
  tombait dans la classification générique `"CONFLICT"` de
  `lib/yelenError.ts` ("modifié depuis un autre appareil… Actualiser") —
  message mensonger (la vraie cause est une règle métier, pas un
  conflit de données) ET bouton sans action réelle (pas de chemin de
  sortie). Corrigé en forçant `reason: "INVALID_STATE"` + le message
  serveur réel pour ce cas précis dans `handleRepondre` des deux écrans
  — la table `CONFLICT` globale de `yelenError.ts` n'a pas été touchée
  (reste correcte pour les vrais conflits ailleurs dans l'app).

### C. Écran Équipe — V1 "consultation + action légère" (périmètre validé par Bryan via question explicite)

`EquipeScreen.tsx`/`useEquipe.ts` remplacent le `PlaceholderScreen`.
Périmètre tranché avec Bryan via `AskUserQuestion` (3 options proposées,
"consultation + suspendre/réactiver" retenue) :
- Liste + fiche détail (rôle, statut, dernière connexion, dernière
  activité) pour admin/superviseur/dirigeant (`equipe.read_full`).
- Suspendre/réactiver un membre (admin seul, `equipe.write`), double-tap
  (arme puis confirme, jamais une action immédiate).
- **Hors périmètre explicite** : création de membre, changement de rôle,
  reset PIN, suppression, badge QR — tout reste réservé au dashboard PC.

**Vrai bug de sécurité trouvé et corrigé en construisant ça** :
`app/api/institution/auth/reauth/route.ts` rotationne systématiquement
la session à chaque succès (nouveau `sid`, ancien révoqué) mais ne
renvoyait le nouveau JWT que dans un cookie — jamais dans le corps JSON
pour un appelant mobile (Bearer token, pas de cookie exploitable). Le
premier admin ayant confirmé son identité depuis le mobile pour
suspendre/réactiver un membre se serait retrouvé avec un token local
pointant vers une session déjà révoquée. Corrigé en ajoutant
`estAppelMobile(request) ? { token } : {}`, même pattern que les 5
routes de connexion déjà documentées dans `mobile/src/auth/session.ts`
(`reauthMembre()` ajoutée à ce fichier, consomme ce token).

**Bug RBAC préexistant trouvé en vérifiant la navigation vers ce nouvel
écran** : `mobile/src/lib/profilAccesSecondaire.ts` limitait l'entrée de
menu "Équipe" à `["admin", "dirigeant"]`, alors que le vrai RBAC serveur
(`equipe.read_full` dans `lib/institutionPermissions.ts`) inclut aussi
`superviseur` — un superviseur ne pouvait même pas atteindre l'écran.
Corrigé (`["admin", "superviseur", "dirigeant"]`).

**`ReauthDialog.tsx`** (nouveau, `components/ui/`) : modale centrée
(jamais une Sheet, même règle que `AuthChallengeDialog.tsx` pour une
alerte critique), PIN puis TOTP si activé. **Bug trouvé en revue
critique avant même le lint** : le texte invitait à saisir "un code de
secours" mais le champ était verrouillé en numérique 6 chiffres — un
admin ayant perdu son téléphone et devant utiliser un code de secours
(format `XXXX-XXXX`, déjà accepté tel quel côté serveur) ne pouvait
physiquement pas le saisir. Corrigé avec la même bascule `backupMode`
que `ReauthModal.tsx` (PC).

### D. Revue critique + build local complet (demande explicite Bryan, exécutée en autonomie)

Lint strict du projet (`react-hooks/*`, règles React Compiler) a révélé
des vrais bugs au-delà du périmètre A-C ci-dessus, tous corrigés (zéro
scope creep au-delà des erreurs réellement signalées) :

- **`react-hooks/set-state-in-effect`** (5 occurrences, dont 4
  préexistantes, jamais liées au travail du jour) : un effet qui ne fait
  que resynchroniser un state local sur un changement de dépendance
  (`ReauthDialog.tsx`, `AuthChallengeDialog.tsx`, `AuthSecurityNotice.tsx`,
  `RendezVousScreen.tsx`, `ClientsScreen.tsx`) déclenche un rendu
  supplémentaire inutile. Corrigé partout avec le même motif —
  "ajustement d'état pendant le rendu" plutôt qu'un effet (pattern
  officiel React, voir
  https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes) :
  comparer la dépendance à sa valeur précédente (state), et appeler
  `setState` directement dans le corps du rendu si elle a changé.
- **`react-hooks/purity`** (`ClockInShiftScreen.tsx::JourContexte`) :
  `Date.now()` appelé pendant le rendu (viole l'idempotence exigée par
  les règles React). Corrigé avec un state `now` rafraîchi par
  `setInterval` (60s, largement suffisant pour un seuil de fraîcheur à
  30 min).
- **Décision assumée, PAS corrigée** (`FeedbackView.tsx`) :
  `progress.value = withTiming(...)` dans un effet — `react-hooks/immutability`
  signale une mutation de "valeur retournée par un hook", mais `progress`
  est un `SharedValue` Reanimated, pas un state React : c'est le motif
  officiellement documenté par Reanimated pour piloter une animation
  (aucun re-rendu React déclenché). Faux positif connu de cette règle
  générique sur les API Reanimated — `eslint-disable-next-line` posé
  avec justification plutôt que de casser une animation qui fonctionne
  correctement.
- **Décision assumée, PAS corrigée** (`useSaveState.ts`) : écriture de
  `currentRef.current` pendant le rendu déplacée dans un effet (fix sûr,
  zéro risque). En revanche, la LECTURE de `savedRef.current` pendant le
  rendu (`isDirty`) a été laissée telle quelle : la convertir en state
  obligerait à ajouter `saved` aux deps de `commit`/`sync`, dont la
  **référence stable est un contrat documenté consommé par des
  appelants distants** (listée sans ré-exécution dans leurs propres
  effets). Changer cette stabilité pour un risque théorique (rendu
  concurrent abandonné — non utilisé sur ce chemin, aucun
  Suspense/`startTransition` autour de ce hook) aurait un rayon d'impact
  disproportionné sur un hook partagé par plusieurs écrans de sauvegarde.
  `eslint-disable-next-line react-hooks/refs` posé avec justification.
- **`@typescript-eslint/no-require-imports`** (`AccueilScreen.tsx`) :
  tentative de conversion `require()` → `import` ESM pour une image
  statique — **revert après coup** : aucun autre endroit du projet
  n'importe un `.png` en ESM (toujours `require()`), et surtout
  `expo-env.d.ts` ne déclare aucun module ambiant `*.png` — l'`import`
  passait Metro (qui résout les fichiers réels) mais **cassait `tsc`**
  (`Cannot find module`), régression trouvée par la propre vérification
  finale de cette session avant d'être déclarée terminée. `require()`
  restauré + `eslint-disable-next-line` justifié (type `any` de
  `@types/node`, jamais vérifié par `tsc`, d'où l'absence du problème
  avant cette tentative).
- **`react/no-unescaped-entities`** (`ClientDetailScreen.tsx`) : apostrophe
  brute dans un texte JSX, corrigée en `&apos;` (même convention que le
  reste du projet).
- **Non touché, backlog documenté** : 14 avertissements préexistants
  (`jsx-a11y/alt-text` ×8, `react-hooks/exhaustive-deps` ×6) sur 8 écrans
  jamais traités aujourd'hui (Accueil, ClientDetail,
  ConversationDetail, 5× Entreprise\*Screen, Historique, Messagerie,
  RdvDetail, RendezVous) — avertissements (pas des erreurs), hors
  périmètre des chantiers A-C, volontairement pas touchés pour ne pas
  élargir le rayon d'impact à des écrans jamais audités ce jour.

**Build complet local, vérifié vert de bout en bout** (`tsc --noEmit`,
`npm run lint`, `npx expo export -p all`) : 0 erreur TypeScript, 0 erreur
lint (14 avertissements préexistants ci-dessus), export complet réussi
3 plateformes (Android/iOS/Web), 80 routes statiques générées. **Pas de
build EAS cloud** (`eas build`) — aucun `eas.json` dans le projet, et un
build cloud nécessite un compte/des credentials hors de portée d'une
exécution autonome ; `expo export` est l'équivalent local maximal
atteignable sans toolchain native (confirmé : pas de dossiers
`ios`/`android` générés, Windows ne peut de toute façon pas lancer
Xcode).

**Réseau instable dans cet environnement d'exécution** (plusieurs
`ECONNRESET`/TLS avortés vers l'API Expo et le registre npm, confirmé à
3 reprises) : `expo-doctor` n'a pas pu vérifier le schéma `app.json` (2/21
checks échoués pour cette raison, pas un vrai problème de config).
`expo-doctor` recommande aussi 6 bumps de version patch (`@expo/ui`,
`expo`, `expo-constants`, `expo-linking`, `expo-notifications`,
`expo-router`, `expo-splash-screen`, tous SDK 57, patch uniquement) via
`npx expo install --fix` — tenté, échoué sur le même `ECONNRESET`
réseau après avoir partiellement réécrit `package.json`. **Annulation
propre** : `package.json` restauré à l'identique (`expo: ~57.0.26`),
`node_modules` vérifié intact (aucune version effectivement changée,
l'échec réseau est survenu avant que `npm install` ne touche les
fichiers). **Action requise de Bryan** : relancer `npx expo install
--fix` depuis un réseau fiable quand l'occasion se présente — aucune
urgence fonctionnelle, ce sont des bumps patch recommandés, pas des
correctifs de bug.
