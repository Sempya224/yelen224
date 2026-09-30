# Yelen Provider Help Center — Audit & document de suivi vivant

Chantier lancé le 21/09/2026 (brief Bryan). **Portée : prestataires
(institutions) uniquement — ne concerne pas les citoyens.** Le Help
Center citoyen, s'il existe un jour, est un chantier séparé.

**Statut global (mis à jour 21/09/2026) : PHASE A (audit technique, 8/8
domaines) VALIDÉE ET CLOSE.** Domaines 1 (Accueil & configuration), 2
(Rendez-vous & clients), 3 (Services & offres), 4 (Communication &
réputation), 5 (Équipe & organisation), 6 (Sécurité & conformité), 7
(Finance) et 8 (Yelen Business) tous validés par Bryan. Baseline
technique figée — les sections 1-7 ne sont plus modifiées.
**Correction actée : le total réel est 8 domaines, pas 12 comme
indiqué par erreur dans les échanges précédents** (voir Domaine 7 pour
le détail).

**Séquence officielle** : Phase A (audit technique) ✅ · Phase B1
(cartographie des sources support) ✅ · Phase B2 (mesure des données
réelles) ✅ (5 requêtes classées, 4 exécutées par Bryan le 21/09/2026,
volumes très faibles : 1 ticket support, 4 signalements) · Phase B3
(croisement) ✅ — 5 cas réels examinés, correspondances posées
prudemment, "LIMITES DU CORPUS SUPPORT ACTUEL" documentées. **Phase C
(matrice de décision) ✅ VALIDÉE** — voir section "PHASE C" en fin de
document : 17 besoins classés (8 connaissances T, 5 problèmes UX + UX6
ajouté depuis, 4 besoins issus du corpus support réel), niveau de
preuve (PR1-PR4), forme d'aide (A/B/C/D/E), pattern réutilisable quand
applicable. **Phase D (architecture) ✅ VALIDÉE** — document séparé
`docs/product/YELEN_PROVIDER_HELP_CENTER_ARCHITECTURE.md` (périmètre,
principes dont audience documentaire et règle de routage, 4 niveaux
d'aide, navigation, contextualisation `TabKey`, gouvernance).

**Phase E (implantation) ✅ vertical slice Signalements ACCEPTÉ**
(21/09/2026) — 3 fichiers modifiés (`ReauthModal.tsx`,
`SecuriteCompteTab.tsx`, `SignalementsTab.tsx`), 4 checkpoints `tsc
--noEmit` propres. Détail complet, revue de réutilisabilité (E.1) et
découverte méthodologique majeure (E.2/E.2.1, "un pattern UX n'est
jamais une preuve de comportement métier") dans
`YELEN_PROVIDER_HELP_CENTER_ARCHITECTURE.md` section 12 — **document à
lire en premier pour reprendre le chantier**, ce fichier-ci ne
reproduit pas ce détail. **UX6** ajouté au registre UX ci-dessous
(notification signalement mal routée, hors périmètre Help Center).
**B3-1 suspendu, pas rejeté** (dépend d'une correction produit
indépendante).

**⏸️ CHANTIER EN PAUSE (21/09/2026) — POINT DE REPRISE :** prochain
lot à sélectionner parmi les candidats encore ouverts de la matrice
C : **T1+T2** (connaissance transverse multi-écrans, Profil
Entreprise/Responsable/Administration/Sécurité, Domaine 1, PR1,
pas de pattern à copier) · **T11** (vulgariser 2 formules de score,
Domaine 4/5, PR1, nécessite relecture complète de
`lib/reputationScore.ts` avant toute phrase) · **T5** (dupliquer une
note déjà écrite sur `ProfilEntrepriseTab.tsx` vers
`DisponibilitesTab.tsx`, Domaine 1/2, PR1, périmètre le plus petit,
déjà vérifié : la note réciproque n'existe pas côté Disponibilités).
**Sélection en attente de Bryan** — chaque lot doit être précédé d'une
vérification technique ciblée (comme B3-1 l'a montré) avant toute
rédaction ou code. Vocabulaire strict à conserver : toute mesure non
faite s'écrit "NON DISPONIBLE / NON AGRÉGÉ", jamais "0". Ce document
et `YELEN_PROVIDER_HELP_CENTER_ARCHITECTURE.md` sont la source de
vérité du chantier — lire les deux avant de reprendre.

**Ne pas confondre Help Center et documentation (renforcé par Bryan,
21/09/2026)** — le futur système aura probablement 4 niveaux distincts,
à garder en tête dès l'audit même si l'architecture n'est pas encore
décidée :
1. **Aide contextuelle dans l'écran** — réponse courte au moment où le
   prestataire bloque (ex. les empty states déjà bien faits de l'onglet
   RDV, voir Domaine 2).
2. **Article Help Center** — explication/action complète.
3. **Connaissance transverse** — concepts qui traversent plusieurs
   écrans (rôles, sécurité/réauthentification, statuts, documents...).
4. **Support humain** — quand la connaissance existante ne suffit pas
   (ticketing `SupportYelenTab`, déjà existant).

Un gap identifié dans ce document **ne devient pas automatiquement un
article** — certains se résolvent par un ajustement UX (ex. un lien
croisé entre deux écrans), certains par de l'aide contextuelle,
certains par un article, certains par une combinaison. Cette décision
est reportée à la Phase 4 (conception), jamais prise pendant l'audit.

**Priorisation du contenu** : quand le chantier passera à la rédaction,
les sujets prioritaires devront venir de tickets/signalements/feedback
**réellement reçus** (`support_tickets` institution, `feedback`,
`signalements`), pas seulement des gaps déduits de la lecture du code —
méthode alignée avec les pratiques recommandées pour les bases de
connaissances. Non fait dans cet audit (aucune requête sur le volume
réel de ces tables à ce stade) — à faire avant la Phase 4.

**Règle du chantier** : chaque futur article du Help Center devra
pouvoir être rattaché à une fonctionnalité, un parcours ou un
comportement réel du produit — référencé ici par fichier/route/table.
Zéro déduction, zéro fonctionnalité imaginée.

**Honnêteté sur la profondeur de ce 1er passage** : audit mené en
direct (Read/Grep/Glob/Bash), sans sous-agent (décision Bryan
21/09/2026), sur une base de 160+ routes `app/api/institution/**` et
~50 composants `*Tab.tsx`. Ce premier passage a privilégié la
profondeur sur l'architecture d'auth/permissions/onboarding et sur tout
ce qui touche déjà à l'aide/au support (périmètre direct du chantier),
et une largeur déclarative (liste, sans relecture ligne à ligne) sur les
~50 modules fonctionnels du dashboard, dont l'état détaillé est déjà
tenu à jour dans `CLAUDE.md` (`/modules-livres`, `/chantier-design`) et
`docs/ui/*`. Section 5 (Gaps) marque explicitement ce qui reste
"À VÉRIFIER" avant toute décision d'implantation.

---

## 0. Méthode

Audit mené en direct, étalé sur plusieurs sessions si nécessaire — la
fidélité au système réel prime sur la vitesse. Chaque affirmation
ci-dessous cite son fichier source.

---

## 1. État actuel

### 1.1 Architecture d'authentification prestataire (3 populations distinctes)

1. **Institution / membre (dashboard Yelen)** — `lib/institutionAuth.ts`
   + `lib/institutionPermissions.ts`. Cookie JWT
   `yelen224_institution_session` (8h, `institution_sessions` en base,
   révocation par session individuelle depuis le 30/08/2026). Deux
   formes de session portées par le même cookie :
   - **Session institution-wide sans membre** (`getAuthenticatedInstitutionSession`)
     — émise uniquement par les 3 flux de connexion "compte principal"
     (OTP, PIN, WebAuthn) quand aucun `institution_membres.compte_principal`
     n'existe encore.
   - **Session membre** (`getAuthenticatedMembre`) — porte `membreId`,
     `role` (5 valeurs, voir 1.2), `accesRestreints` (rôles personnalisés,
     16/09/2026).
   - **Yelen Security Activation** (16/09/2026) : 24h après la première
     connexion (`relation_confirmee_le`), le dashboard se bloque tant
     qu'aucun MFA (TOTP ou passkey) n'est activé — `evaluerActivationSecurite()`.
     Fail-open pour tout compte antérieur au chantier.
2. **Employé (Clock In Shift, portail `/clock/[slug]`)** —
   `lib/employeeAuth.ts`. Cookie séparé `yelen224_employee_session`,
   secret/issuer/audience distincts. 3 rôles (`admin`/`manager`/`employe`),
   population `employees` ≠ `institution_membres` (voir CLAUDE.md
   `/modules-livres`). **Aucun mécanisme d'aide/support repéré dans ce
   portail** (recherche ciblée, voir section 5).
3. **Compte principal vs membres** — `institution_membres.compte_principal`
   distingue le "propriétaire" historique (peut exister sans ligne
   `institution_membres` avant la fondation multi-comptes du
   14/07/2026) des membres créés depuis.

### 1.2 RBAC — source unique `lib/institutionPermissions.ts`

- **5 rôles** (`MEMBRE_ROLES`) : `admin`, `agent` (front office pur),
  `comptable` (espace strictement financier), `superviseur`, `dirigeant`
  (vue exécutive lecture seule sur le sensible). Chacun a déjà un
  **libellé** (`ROLE_LABELS`) et une **description en langage produit**
  (`ROLE_DESCRIPTIONS`) — réutilisable telle quelle pour un article
  "Qui peut faire quoi ?".
- **`TAB_KEYS`** (47 clés) : un onglet par écran réel du dashboard —
  c'est la cartographie exhaustive des modules prestataire (liste
  complète en 2.1). Piloté par `TAB_MATRIX[role][tab] → "full"|"read"|"none"`
  (cosmétique, masque la nav).
- **`ACTION_MATRIX`** (~70 `ActionKey`) : la vraie barrière serveur,
  vérifiée route par route (`can(role, action)`).
- **Rôles personnalisés** (`acces_restreints`, 16/09/2026) : un membre
  garde son rôle système mais peut se voir **retirer** des domaines
  (`DOMAINE_KEYS` : rdv/clients/équipe/finance/configuration/
  sécurité avancée/rapports) — jamais en ajouter au-delà de son rôle.
  `permissionsDuRole()` calcule déjà un résumé "accordé/retiré" par
  domaine, consommé par `EquipeTab.tsx` et l'écran de bienvenue première
  connexion.
- **Constat direct pour le Help Center** : aucun onglet masqué
  (`tabAllowed()` → false) n'explique *pourquoi* au membre concerné —
  le masquage est silencieux (voir Gaps 5).

### 1.3 Onboarding / inscription (`app/institution/inscription/engine/`)

Séquence en étapes : `IntroStep` → `PhoneStep` (OTP) → `ActiviteStep` →
`ResponsableStep` → `ReviewStep` → `VerificationStep` (vérif OTP,
`app/api/institution/auth/verify-otp`) → `SuccessStep`. Messages
d'erreur déjà humanisés côté client (`humanizeVerifyError()` dans
`VerificationStep.tsx` : `LOCKED`, `INVALID_CODE` → phrases produit) —
**pattern réutilisable**, pas généralisé ailleurs (voir Gaps).

Cycle de vie du statut institution (`statut_institution` enum, voir
CLAUDE.md `/enums`) : `en_attente` → `validee` (ou `refusee`). Une fois
`validee`, l'institution entre dans le **Centre de configuration**
(1.4) avant d'accéder au dashboard complet.

### 1.4 Centre de configuration / Setup Center (`configuration-status/route.ts` + `CentreConfigurationTab.tsx`)

Remplace l'onglet "Accueil" tant que l'établissement n'est pas
entièrement configuré (décision CEO 12/08/2026). Agrège 6 groupes
(`profil`, `equipe`, `services`, `horaires`, `profil_public`,
`verification`), chacun avec des items `{ id, label, done, tab }` —
**chaque item pointe déjà vers un `TabKey` précis**. C'est l'ancrage
contextuel le plus naturel pour de l'aide ciblée par écran (ex. un lien
"Comment configurer mes disponibilités ?" directement sur l'item
`disponibilites`). Accessible à tous les rôles authentifiés (pas de
gate RBAC, réponse 100% agrégée/non-PII).

`ConditionsPrestataireModal` (layout.tsx) + route
`conditions-prestataire` : acceptation obligatoire bloquant tout le
dashboard, déclenchée une fois au passage `validee`, ouverte à tout
membre (pas seulement admin) pour ne jamais bloquer une équipe entière
en attendant un admin précis.

### 1.5 Suspension (`suspension/route.ts`, `suspension/revision/route.ts`, `CompteSuspenduScreen.tsx`)

Depuis le 17/08/2026, source structurée (`institution_suspensions` +
`institution_suspension_revisions`, remplace l'ancien mécanisme qui
relisait le texte de la dernière notification). Expose motif,
référence, date, échéance, et l'état d'une éventuelle demande de
révision. **Institutions suspendues avant ce chantier** : aucune donnée
structurée (`motif: null`) — écran honnête plutôt qu'un motif inventé,
comportement déjà conforme au principe `/honnetete` de CLAUDE.md.

### 1.6 L'embryon de Help Center déjà construit (le plus important pour ce chantier)

Trouvé dans `app/[slug]/[id]/layout.tsx`, chantier "Refonte Aide &
ressources" du **06/09/2026** (commentaire ligne 660 : *"Help Center
launcher façon Intercom/Zendesk"*) — **Bryan avait déjà commencé cette
direction produit avant ce brief**, sans document de suivi dédié
jusqu'à aujourd'hui :

- **Popover "Aide Yelen"** (icône `?` du header, raccourci `Ctrl/Cmd+K`,
  `activePopover === "help"`, ligne ~3889) :
  - Barre de recherche filtrant `AIDE_CHAPITRES` (ligne 817) — miroir
    **manuel** (id + titre seulement, pas le contenu) des 10 chapitres
    de `app/guide-prestataire/page.tsx::CHAPITRES`, "tenu à jour
    manuellement" par commentaire explicite du code.
  - 2 cartes d'entrée : **"Support Yelen"** (ouvre `/{slug}/{id}/support`,
    badge `supportUnread`, statut Disponible/Fermé dérivé d'horaires
    codés en dur) et **"Guide Yelen"** (ouvre `/guide-prestataire`).
  - Section "Ressources" : bouton **"Aide & astuces"** (ouvre
    `GuideScalingModal`, ligne 1405, modale de conseils de croissance —
    à ne pas confondre avec le guide) + raccourci "Sécurité du compte".
  - Section "Informations légales" : liens `/cgu`, `/confidentialite`.
- **`GuideScalingModal`** (layout.tsx L1405) : contenu de conseils
  ("Support disponible Lun–Ven, 8h–18h GMT" y est la source de vérité
  citée ailleurs) — distinct du guide-prestataire, jamais audité en
  détail dans ce 1er passage.
- ~~**`app/guide-prestataire/page.tsx`**~~ — **retiré le 21/09/2026**
  (décision Bryan). Route supprimée. Tous les points d'entrée
  repointés/retirés : carte "Guide Yelen" et recherche `AIDE_CHAPITRES`
  du popover "Aide Yelen" (supprimées, le popover garde "Support Yelen",
  "Aide & astuces"/`GuideScalingModal`, "Sécurité du compte", liens
  légaux), lien "FAQ" du bloc "Accès rapides" (Accueil), lien "FAQ" du
  footer dashboard, lien "FAQ" du footer `/institution/connexion`,
  entrée `/guide-prestataire` de `lib/deviceAccess.ts::MOBILE_WALL_EXEMPT_PREFIXES`
  (mur mobile-only citoyen). Voir 1.7 pour le détail des raisons déjà
  repérées (cohérent avec cette décision, conservé à titre d'archive).
- ~~**`AideSupportTab.tsx`** (`TabKey: "parametres-support"`)~~ —
  **retiré le 21/09/2026** (décision Bryan, doublon confirmé du popover
  header). Fichier supprimé, `TabKey`/`TAB_MATRIX` (5 rôles),
  `ALLOWED_TABS_SUSPENDU`, entrée menu "Support & Légal" (renommée
  "Légal"), `KeepMounted`, `overflowTabs` nettoyés dans
  `lib/institutionPermissions.ts` et `layout.tsx`. Le ticketing
  `SupportYelenTab`/`support` (chat humain) **n'a pas été touché**.

### 1.7 ⚠️ `guide-prestataire` ignoré (décision Bryan 21/09/2026) — raisons déjà visibles au 1er passage

**Ce contenu est un ancien guide, à ignorer complètement pour ce
chantier** (décision explicite de Bryan, pas seulement une prudence
d'audit). Conservé ici à titre d'archive des raisons déjà repérées, qui
confirment la décision — inutile de les revérifier ou de les corriger,
ce contenu ne sert de base à rien :
- Tarification en **dollars** ("Plan PRO 7$/mois", "Plan PREMIUM
  15$/mois", annuel 70$/150$) et noms de plans **"Pro"/"Premium"**, alors
  que l'enum réel documenté dans CLAUDE.md `/enums` est
  `plan_abonnement: essentiel, pro, entreprise` — **incohérence
  probable**, à confirmer par lecture de `institutions.plan` en base
  avant toute réutilisation de ce contenu.
- Fonctionnalités citées jamais confirmées présentes dans ce 1er
  passage : export iCal des RDV, API Yelen224, statistiques de scan QR
  (Premium), heatmap jours/heures, comparaison mois/mois.
- Adresses de contact différentes entre le guide
  (`yelen224gn@gmail.com`, tél. New York/Conakry, chat en direct) et
  l'`AideSupportTab.tsx` (`support@yelen224.com`) — deux canaux
  affichés à deux endroits différents du produit, jamais réconciliés.

**Conséquence directe pour ce chantier** : le Help Center part de zéro
sur le contenu. Aucun article de `guide-prestataire` ne sera repris, ni
tel quel ni corrigé — nouveau contenu écrit et validé directement contre
le produit réel. Reste ouvert : que devient `/guide-prestataire`
lui-même (retiré, laissé en l'état hors périmètre, remplacé) — voir
Questions ouvertes §6. Le popover "Aide Yelen" (1.6) linke aujourd'hui
vers ce guide (carte "Guide Yelen", recherche `AIDE_CHAPITRES`,
deep-link `?chapitre=`) — ces points d'entrée devront être repointés
vers le nouveau contenu plutôt que réutilisés tels quels.

### 1.8 Ticketing support humain — deux systèmes parallèles, un seul documenté avant aujourd'hui

- **Citoyen** : documenté dans `docs/product/YELEN_SUPPORT_TICKETING.md`
  (chantier 04/09/2026). `support_tickets`/`support_ticket_messages`/
  `support_ticket_events`/`support_ticket_ratings`, agent humain
  uniquement (zéro LLM), state machine
  `attente_agent → en_cours → resolu → cloture`.
- **Institution** (trouvé dans ce chantier, **jamais documenté avant
  aujourd'hui**) : `SupportYelenTab.tsx` (chantier "Support Yelen
  institution", 06/09/2026), migrations
  `20260906000004_support_tickets_institution.sql` et
  `20260906000005_support_ticket_ratings_institution.sql`, routes
  `app/api/institution/support/tickets/**`. Même modèle que côté
  citoyen (catégories `SUPPORT_CATEGORIES_INSTITUTION`, mêmes statuts,
  mêmes évaluations à froid) mais **table(s) séparée(s)** de la version
  citoyen (migrations distinctes) — à confirmer si schéma identique ou
  dupliqué. Réception live via **SSE** (`.../[id]/stream/route.ts`), pas
  Realtime Supabase direct, car l'institution n'a jamais de session
  Supabase Auth (JWT custom) — même contrainte que `MessagerieTab.tsx`.
  Pas d'envoi d'image sur les tickets (même limitation assumée que
  côté citoyen).
- L'ancien modèle `messages_yelen_institution_conversations` reste en
  base, retrait non encore fait (même situation que
  `messages_yelen_citoyen` côté citoyen).

### 1.9 Autres canaux de remontée existants (adjacents, pas du Help Center)

- **`feedback` route** (`app/api/institution/feedback/route.ts`) :
  canal **institution → Yelen** à sens unique (type `bug`/`suggestion`/
  `ux`/`fonctionnalite`), consulté côté `app/api/admin/feedback`. Aucun
  écran ne permet à l'institution de revoir son propre historique de
  feedback envoyé.
- **`questions_institution`** (`questions/route.ts`) : questions posées
  par les **citoyens** à l'institution — pas un canal d'aide
  prestataire, sans rapport direct avec ce chantier, mentionné pour
  écarter toute confusion.

---

## 2. Fonctionnalités prestataire identifiées

### 2.1 Cartographie complète des modules (47 `TabKey`, source unique `lib/institutionPermissions.ts::TAB_KEYS`)

Regroupement par domaine fonctionnel réel (pas une structure générique)
— fichier composant entre parenthèses quand identifié par
`app/[slug]/[id]/components/*Tab.tsx` :

**Accueil & configuration** : `accueil`, `profil-entreprise`
(ProfilEntrepriseTab), `conditions-informations`
(ConditionsInformationsTab), `configuration-hotel`
(ConfigurationHotelTab, secteur hôtel uniquement), `profil-responsable`
(ProfilResponsableTab), `documents` (DocumentsTab), `parametres`
(ParametresTab), `parametres-securite` (SecuriteCompteTab),
`parametres-notifications` (NotificationsTab),
`parametres-support` (AideSupportTab), `parametres-legal` (LegalTab),
`profil` (ProfilTab).

**Rendez-vous & clients** : `rdv`, `disponibilites`
(DisponibilitesTab), `valider-rdv` (ValiderRdvTab — Front Desk
check-in), `mes-clients` (MesClientsTab), `rdv-historique`
(RdvPasseTab), `scanner`/`codeqr` (CodeQrTab), `documents-clients`
(DocumentsClientsTab — case management complet, voir CLAUDE.md
`/modules-livres`).

**Services & offres** : `services` (ServicesTab / ServicesHotelTab),
`mes-offres` (MesOffresTab), `partenariat`/profil `MonPartenariatTab`
(PartenariatTab).

**Communication & réputation** : `communication` (CommunicationTab —
annonces), `communaute-pro` (CommunauteProTab), `messagerie`
(MessagerieTab), `support` (SupportYelenTab, voir 1.8),
`avis-reputation` (AvisReputationTab), `questions-clients`
(QuestionsClientsTab).

**Équipe & organisation** : `equipe` (EquipeTab), `journal`
(JournalTab — Journal d'activité, voir CLAUDE.md
`/chantier-journal-activite`), `espace-travail` (EspaceTravailTab),
`collaboration` (CollaborationTab — DM interne membre↔membre),
`clock-in-shift` (ClockInShiftTab, population `employees` distincte).

**Sécurité & conformité** : `signalements` (SignalementsTab — case
management complet, voir CLAUDE.md `/modules-livres`).

**Finance (client de l'institution)** : `paiements` (PaiementsTab),
`transactions` (TransactionsTab), `historique-financier`
(HistoriqueFinancierTab), `facturation` (FacturationTab), `rapports`
(RapportsTab), `documents-financiers` (DocumentsFinanciersTab),
`analyse` (CentreAnalyseTab).

**Yelen Business (relation institution ↔ Yelen, 17-18/09/2026, écrans
neufs sans donnée réelle encore)** : `yelen-compte` (YelenCompteTab),
`yelen-contrat` (YelenContratTab), `yelen-forfait` (YelenForfaitTab),
`yelen-paiements` (YelenPaiementsTab), `yelen-transactions`
(YelenTransactionsTab), `yelen-reconciliation`
(YelenReconciliationTab), `yelen-frais-commissions` (YelenFraisTab),
`yelen-facturation` (YelenFacturationTab), `yelen-documents`
(YelenDocumentsTab), `yelen-support` (probablement fusionné avec
`support`/`SupportYelenTab` — relation exacte non vérifiée dans ce
passage).

**Constat pour ce chantier** : c'est une base de connaissance
**énorme** (8 domaines fonctionnels, 47 écrans — correction du
21/09/2026 : "12" utilisé par erreur dans plusieurs échanges avant
d'être recompté précisément ici contre la liste réelle ci-dessus, voir
Domaine 7). Le programme
"Product Hardening" (CLAUDE.md `/programme-hardening`) est la même
liste vue sous l'angle UX ; ce chantier Help Center devra
vraisemblablement suivre le même découpage par domaines plutôt qu'une
structure Help Center générique — cohérent avec la consigne du brief
("architecture basée sur les vrais domaines fonctionnels").

### 2.2 Grille détaillée par domaine

Phase 2 (brief Bryan, 21/09/2026) : construction progressive, domaine
par domaine, de la grille complète pour chaque module identifié en 2.1.
Colonnes : Fonctionnalité → écran/route → rôle(s) → actions possibles →
parcours réel → états → erreurs → blocages → questions utilisateur
potentielles → aide existante → aide manquante → dépendances → source
technique. Méthode : code réel → comportement réel → besoin d'aide réel
(pas l'inverse). Contenu de l'ancien `guide-prestataire` non repris
(retiré, voir 1.7). Un domaine par passage, validation Bryan avant le
suivant.

**Progression** : Domaines 1 à 7/8 validés. Domaine 8/8 (Yelen
Business) traité ci-dessous, en attente de validation — **dernier
domaine du découpage 2.1**. L'audit technique des 8 domaines sera
complet dès sa validation.

**Distinction ajoutée par Bryan à partir du Domaine 4** — trois choses
différentes à ne jamais confondre dans ce document :
- **Pattern d'aide existant** — un mécanisme du produit qui aide déjà
  bien (empty state intelligent, pop de valeur réouvrable, redirection
  contextuelle...). Va dans le nouveau registre des patterns UX
  ci-dessous. **Jamais réécrit en article.**
- **Connaissance transverse** — une règle/notion qui traverse plusieurs
  écrans (rôles, réauthentification, statuts...). Va dans le registre
  des connaissances transverses (T1-T7 et suivants).
- **Problème UX à corriger** — un manque de lien, de repère ou
  d'explication qui se résout mieux par un changement d'interface que
  par du contenu d'aide. Reste noté comme tel, pas comme un futur
  article.

**Méthode consolidée (confirmée par Bryan après Domaine 2, s'applique
à partir de Domaine 3)** : Code réel → comportement réel → parcours
réel → aide existante → gaps → confusions transversales → **moments
d'aide** → questions ouvertes. Un "moment d'aide" = écran → situation →
problème potentiel → réponse que Yelen pourrait fournir à cet instant
— sans décider encore si cette réponse doit être une aide dans l'écran,
un article, une connaissance transverse ou du support humain. Le
nombre de gaps trouvés sur un module **n'est pas un indicateur de
priorité** (un gap rare peut être critique, un gap fréquent peut être
trivial et mieux réglé dans l'UX, un gap transversal ne compte qu'une
fois) — la priorisation réelle viendra plus tard du croisement avec les
tickets/signalements/feedback réels, pas du comptage de cet audit.

---

#### Domaine 1 — Accueil & configuration (11 modules)

Domaine d'entrée du parcours prestataire : identité de l'établissement,
onboarding post-inscription, sécurité du compte, réglages. Périmètre :
`accueil`, `profil-entreprise`, `conditions-informations`,
`configuration-hotel`, `profil-responsable`, `documents`, `parametres`,
`parametres-securite`, `parametres-notifications`, `parametres-legal`,
`profil`.

##### 1. Accueil (`accueil`)

- **Écran/route** : `app/[slug]/[id]/layout.tsx` (rendu inline, pas de
  composant `*Tab.tsx` séparé — écran le plus volumineux du dashboard).
- **Rôle(s)** : tous rôles (`TAB_MATRIX.*.accueil = "full"` pour les 5
  rôles) — contenu affiché diffère cependant selon le rôle (agent est
  redirigé vers `valider-rdv`, comptable a son propre
  `FinanceAccueilTab`, voir CLAUDE.md `/modules-livres`).
- **Actions possibles** : accès rapides (Annonces, Mes services,
  Signalements — "FAQ" retirée 21/09/2026, voir 1.7), consultation
  KPI/`ObjectifsHebdo`/activité récente, navigation vers tout le reste
  du dashboard.
- **Parcours réel** : tant que le **Centre de configuration** (module
  7bis, voir CentreConfigurationTab.tsx en 1.4) n'est pas satisfait sur
  tous ses groupes `blocking`, cet onglet est **remplacé** par le Setup
  Center — jamais les deux affichés en même temps.
- **États** : Setup Center actif (EXISTE, `configuration-status` route)
  / dashboard normal / suspendu (`CompteSuspenduScreen.tsx`, voir 1.5).
- **Erreurs** : non auditées en détail dans ce passage (écran trop
  volumineux pour une lecture exhaustive ligne à ligne) — À VÉRIFIER.
- **Blocages** : accès complet conditionné à la sortie du Setup Center
  (groupes `blocking`, voir module 7bis).
- **Questions utilisateur potentielles** : "Pourquoi je vois un écran
  de configuration au lieu de mon dashboard ?" / "Qu'est-ce qui manque
  encore pour débloquer l'accueil normal ?"
- **Aide existante** : **ABSENT** — aucun texte explicatif au-delà des
  libellés d'items du Setup Center lui-même.
- **Aide manquante** : article "Comprendre le Centre de configuration"
  ; explication du bandeau "Statut juridique et activité manquants"
  (ProfilEntrepriseTab, voir module 2) qui bloque indirectement
  `documents`.
- **Dépendances** : `GET /api/institution/configuration-status`,
  `lib/institutionConfigProgress.ts`.
- **Source technique** : `app/[slug]/[id]/layout.tsx`,
  `CentreConfigurationTab.tsx`.

##### 2. Profil Entreprise (`profil-entreprise`)

- **Écran/route** : `ProfilEntrepriseTab.tsx` ↔ `GET/PUT
  /api/institution/profile`, section "Identité internationale" ↔
  `GET/PUT /api/institution/identite-internationale`.
- **Rôle(s)** : `admin` (`full`) uniquement — 4 autres rôles à `none`
  (`TAB_MATRIX`).
- **Actions possibles** : édition identité publique (logo, bannière,
  description, langues, horaires publics, contact, géolocalisation via
  `LocationPicker`) ; sélecteur **statut juridique + catégorie +
  activité** en 3 étapes (`TaxoModal`) ; déclaration "organisation basée
  à l'étranger" (`IdentiteInternationaleSection`, formulaire dédié avec
  ses propres champs requis).
- **Parcours réel** : pré-rempli depuis l'onboarding (`name`,
  ville, statut_juridique/activité si déjà connus) ; sauvegarde par
  bouton unique "Enregistrer"/"Modifier" selon `dirty` ; `TaxoModal`
  sauvegarde séparément (bouton propre étape 3).
- **États** : `statutJuridique`/`activitePrincipaleId` manquants →
  bandeau orange bloquant "Compléter maintenant" ; `docsLocked` (des
  documents déjà soumis avec ce statut) → statut juridique **verrouillé**
  dans le sélecteur (étape 1), message "Contactez le support Yelen224
  pour le corriger" ; identité internationale toujours "non vérifiée
  automatiquement" tant qu'aucune action admin Yelen Trust n'a eu lieu.
- **Erreurs** : validation champ par champ (nom/ville requis, URL site
  web via `validerUrlExterne`) avec message inline + toast ; échec
  upload logo/bannière/photo (`"Échec de l'envoi de l'image."`) ; échec
  sauvegarde générique (`j?.error || "Erreur lors de l'enregistrement."`).
- **Blocages** : **`documents` (module 6) reste inaccessible tant que
  statut juridique + activité ne sont pas renseignés ici** — dépendance
  inter-écrans explicite, jamais expliquée à l'utilisateur autrement que
  par le bandeau orange sur CET écran (rien sur l'écran Documents
  lui-même ne renvoie ici, voir module 6).
- **Questions utilisateur potentielles** : "Pourquoi je ne peux pas
  changer mon statut juridique ?" (docsLocked) / "Que signifie
  organisation basée à l'étranger, dois-je l'activer ?" / "Pourquoi mes
  horaires ici sont différents de l'onglet Disponibilités ?" (deux
  mécanismes séparés, dette connue documentée dans le code lui-même).
- **Aide existante** : **ABSENT** — seuls des indices visuels in-situ
  (bandeau orange, note bleue horaires), aucun article.
- **Aide manquante** : article "Statut juridique et activité — pourquoi
  c'est obligatoire et comment le modifier" ; clarification
  horaires publics vs disponibilités réservables ; article "Organisation
  étrangère — quand le déclarer".
- **Dépendances** : `lib/institutionTaxonomy.tsx`, `activite_categories`/
  `activites` (tables publiques), `institution_activites`,
  module Documents (6), module Services (`services`, hors domaine 1).
- **Source technique** : `ProfilEntrepriseTab.tsx` (865 lignes),
  `api/institution/profile`, `api/institution/identite-internationale`.

##### 3. Conditions & informations (`conditions-informations`)

- **Écran/route** : `ConditionsInformationsTab.tsx` ↔ `PUT
  /api/institution/profile` (sauvegarde par champ).
- **Rôle(s)** : `admin` uniquement (`full`).
- **Actions possibles** : remplir/modifier 3 textes libres publics
  (conditions de l'entreprise, informations importantes, informations
  légales), chacun avec bascule vue/édition indépendante.
- **Parcours réel** : première visite = 3 champs vides en mode édition
  directe ; une fois rempli, bascule en lecture avec bouton "Modifier" +
  date de dernière mise à jour affichée.
- **États** : rempli / vide (`"Cet établissement n'a pas encore
  renseigné cette section"` côté fiche publique citoyen).
- **Erreurs** : `j?.error || "Erreur lors de l'enregistrement."`
  générique par champ.
- **Blocages** : aucun repéré — champs facultatifs, ne bloquent pas le
  Setup Center (le groupe `profil_public` du Setup Center inclut
  `conditions`/`infos_legales` comme `blocking: true`, voir module 1 —
  donc en pratique **indirectement bloquant** pour sortir du Setup
  Center, à ne pas confondre avec "facultatif").
- **Questions utilisateur potentielles** : "Ces textes sont-ils
  obligatoires ?" (réponse réelle : oui pour sortir du Setup Center,
  jamais dit explicitement sur cet écran) / "Où ces textes
  apparaissent-ils côté citoyen ?"
- **Aide existante** : **ABSENT**.
- **Aide manquante** : article expliquant le lien avec le Setup Center
  et le rendu public exact (popup fiche institution).
- **Dépendances** : module 1 (Setup Center, groupe `profil_public`),
  module 4 (Configuration Hôtel réutilise `FieldCard` de ce fichier pour
  `informations_importantes`).
- **Source technique** : `ConditionsInformationsTab.tsx` (164 lignes,
  exporte aussi `FieldCard`).

##### 4. Configuration Hôtel (`configuration-hotel`)

- **Écran/route** : `ConfigurationHotelTab.tsx` ↔ `PUT
  /api/institution/profile` (`equipements_etablissement` +
  `informations_importantes` réutilisé).
- **Rôle(s)** : `admin` uniquement ; **gating supplémentaire non-RBAC** :
  visible uniquement si `institutions.secteur/activité principale =
  "hotellerie"` (vérifié dans `page.tsx`, pas dans `TAB_MATRIX`).
- **Actions possibles** : cocher des équipements d'établissement
  catégorisés (vocabulaire contrôlé `lib/hotelEquipements.tsx`) ;
  renseigner des règles complémentaires (check-in/out, restrictions) via
  le même `FieldCard` que le module 3 ; raccourci vers l'onglet Services
  pour gérer les chambres (**pas ici**, séparation stricte
  établissement/chambre).
- **Parcours réel** : remplace, pour ce secteur uniquement, l'ancien
  texte libre "Équipements & règles" par une checklist structurée.
- **États** : `dirty` (équipements modifiés non sauvegardés) → bouton
  "Enregistrer" actif.
- **Erreurs** : `j?.error || "Erreur lors de l'enregistrement."`.
- **Blocages** : aucun direct ; le Setup Center (module 1) bascule sur
  `equipements_etablissement` comme signal de complétion à la place de
  `informations_importantes` pour ce secteur (voir `configuration-status`
  route, gating `isHotel`).
- **Questions utilisateur potentielles** : "Un équipement non coché,
  est-ce grave ?" (non affiché publiquement, réponse déjà dans le texte
  d'intro de l'écran) / "Où gérer mes chambres ?" (déjà répondu par le
  raccourci in-situ vers Services).
- **Aide existante** : **PARTIEL** — le raccourci "Gérer vos chambres"
  in-situ répond déjà à une confusion probable ; pas d'article dédié.
- **Aide manquante** : rien de critique identifié dans ce passage —
  écran déjà largement auto-explicatif.
- **Dépendances** : module 3 (`FieldCard` partagé), `ServicesHotelTab.tsx`
  (hors domaine 1, chambres + équipements par chambre), module 1 (Setup
  Center, branche hôtel).
- **Source technique** : `ConfigurationHotelTab.tsx` (145 lignes),
  `lib/hotelEquipements.tsx`.

##### 5. Profil Responsable (`profil-responsable`)

- **Écran/route** : `ProfilResponsableTab.tsx` ↔ `GET/PUT
  /api/institution/responsable` (table `institution_responsables`).
- **Rôle(s)** : `admin` (`full`), `dirigeant` (`read` — prop `access`
  passée en lecture seule, champs désactivés + pas de bouton
  Enregistrer).
- **Actions possibles** : identité personnelle du responsable
  (prénom/nom/rôle/téléphone/email/photo), distincte du profil public
  entreprise.
- **Parcours réel** : pré-rempli depuis l'onboarding pour les comptes
  créés avant la migration dédiée (`institutions.responsable_*`).
- **États** : bouton "Enregistrer" actif si `isDirty` et champs requis
  valides, sinon "Modifier" (état neutre) — désactivé uniquement si
  prénom/nom manquants.
- **Erreurs** : "Le prénom est requis."/"Le nom est requis." (validation
  client avant tout appel réseau) ; erreur serveur générique sinon.
- **Blocages** : ce module est un des items `blocking` du groupe
  `profil` du Setup Center (module 1) — `done` dès que `phone`+`email`
  du responsable sont renseignés.
- **Questions utilisateur potentielles** : "Quelle différence avec
  Profil Entreprise ?" (jamais explicité sur cet écran, seulement en
  commentaire de code) / "Cette info est-elle visible des citoyens ?"
  (réponse réelle : non, contrairement à Profil Entreprise — jamais dit
  explicitement à l'écran).
- **Aide existante** : **ABSENT**.
- **Aide manquante** : article clarifiant Profil Entreprise (public) vs
  Profil Responsable (interne, non public) vs Administration & accès
  (module 11, identité de connexion du membre courant) — 3 écrans
  distincts facilement confondus.
- **Dépendances** : module 1 (Setup Center, groupe `profil`).
- **Source technique** : `ProfilResponsableTab.tsx` (148 lignes).

##### 6. Documents institutionnels (`documents`)

- **Écran/route** : `DocumentsTab.tsx` ↔ `GET/POST
  /api/institution/documents` (table `documents_institution`).
- **Rôle(s)** : `admin` (`full`), `dirigeant` (`read`).
- **Actions possibles** : upload de documents de vérification (type
  dérivé de `statut_juridique`, jamais un re-choix), renvoi possible
  uniquement si `complement_demande`/`rejete`.
- **Parcours réel** : 3 vues totalement différentes selon l'état :
  (a) **profil incomplet** (`!statut_juridique`) → écran bloqué avec
  message "Profil incomplet" et lien implicite vers le module 2 (aucun
  bouton direct, juste un texte) ; (b) **institution validée** → écran
  figé listant les types validés, jamais les fichiers ; (c) **tous
  documents soumis mais pas encore validée** → écran "Merci, vos
  documents sont bien reçus", plus aucune zone de dépôt ; (d) **écran
  actif normal** → une carte par document avec zone de dépôt.
- **États par document** : `À fournir` / `Reçu` (bascule automatique en
  `En cours d'examen` après 24h, `RECU_VERS_EN_EXAMEN_MS`) / `Validé` /
  `Rejeté` / `Complément demandé` (badges colorés).
- **Erreurs** : `"Échec de l'envoi du document."` générique.
- **Blocages** : **l'institution ne voit JAMAIS le fichier envoyé** —
  principe non négociable (commentaire en tête de fichier, niveau
  "gouvernemental/Stripe Connect/Doctolib"), donc aucune façon de
  vérifier ce qui a été réellement soumis sans redemander ; documents
  déjà `recu`/`valide` → zone de dépôt verrouillée, aucun renvoi
  possible même si l'utilisateur se rend compte d'une erreur.
- **Questions utilisateur potentielles** : "Pourquoi je ne peux pas
  accéder à cet écran ?" (statut juridique manquant, renvoie au module
  2 sans lien cliquable) / "Combien de temps avant validation ?"
  (aucune indication de délai sur cet écran contrairement à l'ancien
  guide retiré, qui affirmait "72h ouvrées" jamais vérifié) / "Je me
  suis trompé de fichier, comment le retirer ?" (impossible une fois
  `recu`) / "Que signifie Complément demandé ?".
- **Aide existante** : **ABSENT** — aucun délai affiché, aucune
  explication du motif de rejet au-delà du texte libre saisi par
  l'admin Yelen (`motif_rejet`), aucun lien vers le module 2 en cas de
  blocage.
- **Aide manquante** : article sur les documents requis par statut
  juridique (`lib/documentsInstitution.ts::getRequiredDocuments`,
  jamais lu en détail dans ce passage — À VÉRIFIER) ; clarification
  délai réel de traitement (aucune source fiable trouvée, ne pas
  reprendre le chiffre de l'ancien guide sans confirmation) ; lien direct
  vers Profil Entreprise depuis le message "Profil incomplet".
- **Dépendances** : module 2 (statut juridique + activité, bloquant),
  module 1 (Setup Center, groupe `verification`), vérification admin
  Yelen Trust (hors périmètre institution).
- **Source technique** : `DocumentsTab.tsx` (264 lignes),
  `lib/documentsInstitution.ts` (À VÉRIFIER, non lu en détail).

##### 7. Paramètres — écran hub (`parametres`)

- **Écran/route** : rendu inline dans `layout.tsx` (carte compte +
  apparence) + `ParametresTab.tsx` (export `ParametresDangerZone`
  uniquement, malgré le nom du fichier).
- **Rôle(s)** : `admin` (`full`) uniquement — 4 autres rôles `none`.
- **Actions possibles** : voir/modifier logo+nom+ville (raccourci vers
  module 2), changer le thème (Système/Clair/Sombre), naviguer vers
  Sécurité/Notifications/Légal/Abonnement, **se déconnecter**,
  **supprimer le compte** (flux 3 étapes : sondage de motif →
  transparence sur les conséquences → confirmation par saisie du nom
  exact de l'institution, protégée par réauthentification récente).
- **Parcours réel** : suppression = demande différée 30 jours
  (`/api/institution/auth/deletion/request`), réversible en se
  reconnectant avant cette échéance — jamais une suppression immédiate.
- **États** : badges "Compte validé"/"Vérifié" affichés sur la carte
  compte selon `statut`/`badge_verifie`.
- **Erreurs** : "Le nom saisi ne correspond pas exactement." (confirmation
  suppression) ; `REAUTH_REQUIRED` → `ReauthModal` avant de continuer ;
  erreur réseau générique.
- **Blocages** : suppression bloquée tant que la ré-authentification
  récente (`INSTITUTION_REAUTH_WINDOW_MS`, 10 min) n'est pas satisfaite.
- **Questions utilisateur potentielles** : "Que se passe-t-il exactement
  si je supprime mon compte ?" (déjà répondu en détail à l'étape
  "transparence" — bon exemple d'aide contextuelle déjà bien faite) /
  "Puis-je annuler une suppression demandée ?" (oui, 30 jours, dit à
  l'écran) / "Pourquoi on me redemande mon identité pour supprimer le
  compte ?" (`REAUTH_REQUIRED`, jamais expliqué explicitement, juste un
  modal qui apparaît).
- **Aide existante** : **PARTIEL** — le flux de suppression est déjà un
  bon exemple d'aide contextuelle intégrée (étape "transparence" dédiée,
  lien mailto support) ; rien pour le reste de l'écran (thème,
  ré-authentification).
- **Aide manquante** : article "Pourquoi Yelen redemande votre identité"
  (mécanisme de réauth récente, transversal à plusieurs écrans du
  domaine sécurité — pas propre à cet écran).
- **Dépendances** : module 2 (raccourci "Modifier"), `LogoutFlow.tsx`,
  `ReauthModal.tsx`, `/institution/abonnement` (hors domaine 1).
- **Source technique** : `layout.tsx` (carte compte + apparence),
  `ParametresTab.tsx` (181 lignes, `ParametresDangerZone`).

##### 8. Sécurité du compte (`parametres-securite`)

- **Écran/route** : `SecuriteCompteTab.tsx` ↔ `GET
  /api/institution/security-status` + routes dédiées par action.
- **Rôle(s)** : `admin` uniquement (`full`) — 4 autres rôles `none`,
  écran renvoie 403 (`forbidden`) sinon.
- **Actions possibles** : définir/modifier/supprimer un **PIN**
  institution-wide ; ajouter/retirer des **clés d'accès (Passkeys/
  WebAuthn)** ; activer/désactiver la **2FA TOTP** + régénérer les codes
  de secours (`TotpSection.tsx`, partagé avec module 11) ; consulter et
  déconnecter les **appareils mémorisés** (individuellement ou "tous
  sauf celui-ci") ; consulter les **5 dernières connexions**
  (Journal d'activité filtré) ; voir email/téléphone de récupération
  (masqués, **lecture seule sur cet écran** — aucune action pour les
  modifier trouvée dans ce passage, À VÉRIFIER).
- **Parcours réel** : statut de sécurité calculé côté client
  (`protectionsActives`, jamais persisté) — "protégé" dès qu'au moins
  une protection (PIN/2FA/passkey) est active, sinon bandeau doré
  "peut être mieux protégé". Ajout de passkey : prompt de nom
  d'appareil optionnel → `startRegistration` (WebAuthn navigateur) →
  vérification serveur.
- **États** : `pin_configured`, `totp_enabled`, nombre de passkeys/
  appareils mémorisés actifs (`status !== "revoked"`, un bug de filtre
  déjà corrigé une fois, documenté dans le code).
- **Erreurs** : `SecurityError` WebAuthn (RP ID = IP plutôt que nom de
  domaine, cause réelle diagnostiquée le 16/09/2026, message dédié
  "utilisez localhost ou le domaine Yelen") vs autres `DOMException`
  (annulation utilisateur, message générique "Enregistrement annulé.") ;
  PIN invalide (format 4-8 chiffres, confirmation qui ne correspond
  pas) ; toutes les erreurs serveur ont un message humanisé par action
  (pas de message technique brut visible).
- **Blocages** : plusieurs actions sensibles (ajouter passkey, révoquer
  passkey, régénérer codes de secours) exigent une
  **ré-authentification récente** (`REAUTH_REQUIRED` → `ReauthModal`) ;
  **changement de mot de passe non self-service** (ligne informative
  "Modification en ligne bientôt disponible", aucune action possible) ;
  écran entièrement inaccessible aux 4 rôles non-admin.
- **Questions utilisateur potentielles** : "Pourquoi je ne peux pas
  changer mon mot de passe ?" (fonctionnalité non construite, dit
  explicitement à l'écran) / "Pourquoi Yelen me redemande mon PIN/2FA
  pour ajouter une clé d'accès ?" (réauth) / "Le QR code WebAuthn ne
  s'affiche pas / erreur de sécurité" (cas `SecurityError`, déjà un
  message clair mais aucun article pour creuser) / "Qu'est-ce qu'une
  clé d'accès (Passkey) exactement ?" (jamais expliqué au sens produit,
  seulement en commentaire de code : "la biométrie de l'appareil ne fait
  que débloquer localement la clé, Yelen ne stocke jamais de donnée
  biométrique").
- **Aide existante** : **PARTIEL** — messages d'erreur déjà bien
  humanisés cas par cas (meilleur exemple du domaine), mais zéro article
  de fond (qu'est-ce qu'une passkey, pourquoi la réauth, comment lire
  "protections actives").
- **Aide manquante** : article "Passkeys expliquées" ; article
  transversal "Pourquoi Yelen vous redemande votre identité" (réauth,
  partagé avec modules 7 et 11) ; note honnête sur l'absence de suivi
  des changements PIN/2FA/passkey dans l'Activité de sécurité (le code
  l'affiche déjà lui-même : *"Le suivi des changements de sécurité (PIN,
  2FA, clés d'accès) arrive bientôt"* — bon candidat à reprendre tel
  quel dans un article).
- **Dépendances** : `lib/institutionAuth.ts` (sessions, réauth),
  `TotpSection.tsx`/`PasskeySection.tsx` (partagés module 11),
  `ReauthModal.tsx`, Journal d'activité (`api/institution/journal`).
- **Source technique** : `SecuriteCompteTab.tsx` (534 lignes),
  `TotpSection.tsx` (223 lignes).

##### 9. Notifications (`parametres-notifications`)

- **Écran/route** : `NotificationsTab.tsx` ↔ `GET/PATCH
  /api/institution/notification-prefs`, `POST /api/institution/push`.
- **Rôle(s)** : `admin` uniquement (`full`).
- **Actions possibles** : activer/désactiver la notif in-app par
  catégorie (confirmation, rappels, annulation/report, RDV terminé) ;
  activer les notifications **push navigateur** sur l'appareil courant.
- **Parcours réel** : toggle optimiste (mise à jour visuelle immédiate,
  rollback si l'appel serveur échoue).
- **États** : canaux **Email et SMS visibles mais désactivés** en
  permanence (`disabled`, tooltip "Bientôt disponible") — apparence de
  choix qui n'en est pas un ; push "Activées"/bouton "Activer" selon
  souscription `serviceWorker` déjà présente.
- **Erreurs** : "Activation impossible — vérifiez la permission de
  notifications du navigateur." (push refusé côté OS/navigateur) ;
  "Erreur lors de l'enregistrement"/"Erreur réseau" (toggle in-app).
- **Blocages** : "RDV dépassés — action requise" toujours actif,
  **non désactivable** (alerte opérationnelle, dit explicitement à
  l'écran) — pas un vrai blocage utilisateur mais une contrainte
  produit à documenter.
- **Questions utilisateur potentielles** : "Pourquoi je ne peux pas
  activer les notifications par email/SMS ?" (pas construit, déjà dit à
  l'écran, "arrivent bientôt") / "J'ai cliqué Activer sur le push mais
  rien ne se passe" (permission navigateur refusée en amont — message
  déjà correct mais pas d'article pour diagnostiquer par navigateur).
- **Aide existante** : **PARTIEL** — les limitations (Email/SMS,
  push refusé) sont déjà dites explicitement in-situ.
- **Aide manquante** : rien de critique — écran déjà transparent sur ses
  propres limites, bon candidat pour un simple lien "En savoir plus" côté
  push si un jour un article dédié existe, pas prioritaire.
- **Dépendances** : `lib/pushClient.ts`, service worker (`/sw.js`).
- **Source technique** : `NotificationsTab.tsx` (184 lignes).

##### 10. Légal (`parametres-legal`)

- **Écran/route** : `LegalTab.tsx`, 2 liens statiques (`/cgu`,
  `/confidentialite`).
- **Rôle(s)** : `admin` uniquement (`full`).
- **Actions possibles** : consulter CGU / politique de confidentialité.
- **Parcours réel / états / erreurs / blocages** : aucun — écran
  purement statique, rien à charger.
- **Questions utilisateur potentielles** : aucune friction identifiable.
- **Aide existante** : **EXISTE** (au sens strict : ce sont déjà les
  pages d'aide/légal elles-mêmes).
- **Aide manquante** : aucune.
- **Dépendances** : `/cgu`, `/confidentialite` (pages publiques, hors
  périmètre institution).
- **Source technique** : `LegalTab.tsx` (37 lignes).

##### 11. Administration & accès — profil du membre connecté (`profil`)

- **Écran/route** : `ProfilTab.tsx` ↔ `GET /api/institution/membres`
  (branche "moi"), `PATCH /api/institution/membres` (changement PIN
  personnel), `GET /api/institution/journal` (activité propre au
  membre), `GET /api/institution/security-status` (aperçu appareils,
  admin uniquement).
- **Rôle(s)** : **les 5 rôles** (`full` pour tous) — contenu diffère :
  admin voit un raccourci vers Sécurité du compte + aperçu "Appareils &
  sessions" institution-wide ; les 4 autres rôles voient directement
  `TotpSection`/`PasskeySection` inline (pas d'accès à
  `parametres-securite`).
- **Actions possibles** : changer son PIN personnel (6 chiffres) ;
  gérer sa propre 2FA/passkeys (rôles non-admin) ; consulter son
  identité administrative (rôle, identifiant, dernière connexion) et
  son activité récente (connexions + événements équipe le concernant).
- **Parcours réel** : distinct de "Sécurité du compte" (module 8) par
  design — un seul point d'entrée pour **agir** sur l'institution-wide
  (module 8, admin only), ce module reste un aperçu **personnel** même
  pour l'admin.
- **États** : `verrouille` (si `locked_until` dans le futur, badge rouge
  "Verrouillé", réévalué à chaque rendu) ; `compte_principal` (badge
  informatif).
- **Erreurs** : "Erreur lors du changement de PIN" générique.
- **Blocages** : aucun direct repéré.
- **Questions utilisateur potentielles** : "Différence avec Sécurité du
  compte ?" (déjà en partie répondu par le module 8, mais aucun texte
  produit ne relie les deux écrans pour l'utilisateur) / "Que signifie
  Verrouillé sur mon compte ?" (`locked_until`, jamais expliqué à
  l'écran ni ailleurs dans ce passage — mécanisme de verrouillage lui-même
  non audité, À VÉRIFIER, probablement lié aux tentatives échouées de
  connexion membre).
- **Aide existante** : **ABSENT**.
- **Aide manquante** : article clarifiant Administration & accès
  (module 11, personnel) vs Sécurité du compte (module 8,
  institution-wide, admin) — même besoin que la confusion Profil
  Entreprise/Profil Responsable (module 5) ; explication du verrouillage
  de compte membre (`locked_until`) — mécanisme non audité en détail ici.
- **Dépendances** : module 8 (raccourci pour l'admin), `TotpSection.tsx`/
  `PasskeySection.tsx` (partagés), Journal d'activité.
- **Source technique** : `ProfilTab.tsx` (324 lignes).

---

#### Synthèse rapide — Domaine 1

**Aide existante par module** : EXISTE (1 — Légal) · PARTIEL (4 —
Configuration Hôtel, Paramètres, Sécurité du compte, Notifications) ·
ABSENT (6 — Accueil, Profil Entreprise, Conditions & informations,
Profil Responsable, Documents, Administration & accès).

**Confusions transversales identifiées** (reviennent sur plusieurs
modules, candidates à un seul article plutôt que 3 dupliqués) :
1. Profil Entreprise (public) vs Profil Responsable (interne) vs
   Administration & accès (identité de connexion du membre) — 3 écrans
   au nom proche, jamais distingués explicitement à l'écran.
2. Sécurité du compte (institution-wide, admin) vs Administration &
   accès (personnel, 5 rôles) — même confusion de nommage.
3. Réauthentification récente (`REAUTH_REQUIRED`) — apparaît sur au
   moins 3 écrans (Sécurité du compte, suppression de compte, ajout
   passkey) sans jamais être expliquée une seule fois en langage produit.
4. **Documents (module 6) dépend silencieusement de Profil Entreprise
   (module 2)** — aucun lien croisé dans l'UI entre les deux écrans.

**À vérifier avant tout contenu** (trouvé dans le code mais non
confirmé en base/comportement réel dans ce passage) :
- `lib/documentsInstitution.ts::getRequiredDocuments` — liste réelle des
  documents requis par statut juridique, non lue en détail.
- Délai réel de traitement des documents (aucune source fiable — ne pas
  reprendre le chiffre "72h" de l'ancien guide retiré).
- Mécanisme de verrouillage de compte membre (`locked_until`) —
  déclencheur non identifié dans ce passage.
- Erreurs de l'écran "Accueil" lui-même (fichier trop volumineux pour
  une lecture exhaustive dans ce passage).

---

#### Domaine 2 — Rendez-vous & clients (8 modules)

Cœur opérationnel quotidien du prestataire : gestion des demandes de
RDV, créneaux, check-in, historique client, présence, documents
échangés avec un client précis. Périmètre : `rdv`, `disponibilites`,
`valider-rdv`, `mes-clients`, `rdv-historique`, `scanner`, `codeqr`,
`documents-clients`.

**Constat méthode** : 3 de ces 8 écrans (`valider-rdv`,
`disponibilites`, `documents-clients`) sont déjà densément documentés
dans CLAUDE.md (`/modules-livres`, `docs/ui/*`) suite à leurs refontes
"Enterprise" — ce passage vérifie/complète directement dans le code
plutôt que de tout relire ligne à ligne, avec citations précises.

##### 1. Rendez-vous (`rdv`)

- **Écran/route** : rendu inline `layout.tsx` (~L4802-5267, pas de
  fichier séparé) ↔ `GET/PATCH /api/institution/rdv`, export CSV,
  actions accepter/refuser/prendre en charge/marquer absent/marquer
  terminé.
- **Rôle(s)** : `admin`/`agent`/`superviseur` en écriture
  (`rdv.write`) ; `dirigeant` lecture seule (`read`) ; `comptable` sans
  accès (`none`).
- **Actions possibles** : par statut — `nouveau` → Accepter / Refuser
  (menu) / Absent (si en retard) ; `en_attente` → Prendre en charge /
  Absent (si en retard) ; `confirme` → Marquer terminé (**désactivé
  avec tooltip "Présence non confirmée" tant que le QR n'a pas été
  scanné**) ; export CSV ; recherche/filtre date/service ; tri.
- **Parcours réel** : 6 KPI (Nouveau/En attente/Non traités/Confirmés/
  Terminés/Annulés) + Total ; 8 filtres statut avec compteurs ; section
  séparée "RDV Payants — validation en attente" qui renvoie vers
  l'onglet `valider-rdv` (module 3) plutôt que de dupliquer l'action ici.
- **États** : badge `en_retard`/"Non traité" dérivé (RDV dont l'heure
  est dépassée sans décision prise), distinct du statut base de
  données `statut_rdv`.
- **Erreurs** : non lues en détail pour les handlers `handleAccept`/
  `handleRefuse`/`handlePrendreEnCharge` (fonctions définies plus haut
  dans `layout.tsx`, hors de la portion lue ce passage) — À VÉRIFIER.
- **Blocages** : "Marquer terminé" bloqué tant que la présence n'est
  pas confirmée par scan QR (module 6/7) — dépendance inter-écrans
  explicite et déjà bien signalée par un tooltip (bon exemple d'aide
  contextuelle existante).
- **Questions utilisateur potentielles** : "Pourquoi je ne peux pas
  marquer ce RDV terminé ?" (déjà répondu par le tooltip natif) /
  "Que veut dire Non traité ?" (dérivé, jamais expliqué au-delà du
  badge) / "Pourquoi ce RDV apparaît dans la section RDV Payants et pas
  dans la liste normale ?" (double affichage volontaire, jamais
  explicité).
- **Aide existante** : **EXISTE, remarquable** — les empty states de
  cet écran sont le meilleur exemple d'aide contextuelle déjà présente
  dans tout le dashboard : message différent et actionnable selon que
  l'institution est `refusee` (CTA "Contacter le support"),
  `suspendue` (CTA "Contacter le support"), `en_attente` (CTA
  "Vérifier mon profil", renvoie au Domaine 1 module 2), `validee` sans
  RDV (CTA "Voir ma fiche publique"), ou un filtre statut précis vide
  (texte positif adapté, ex. "Zéro annulation — un bon signe").
- **Aide manquante** : rien de prioritaire sur les empty states
  eux-mêmes ; manque une explication du badge "Non traité"
  (en_retard) et de la relation avec la section RDV Payants.
- **Dépendances** : Domaine 1 module 2 (profil incomplet → CTA),
  module 3 (`valider-rdv`, RDV payants), module 6/7 (scanner, présence
  confirmée bloque "Marquer terminé").
- **Source technique** : `app/[slug]/[id]/layout.tsx` L4802-5267.

##### 2. Disponibilités (`disponibilites`)

- **Écran/route** : `DisponibilitesTab.tsx` (644 lignes) ↔
  `PUT /api/institution/disponibilites`, génération via
  `lib/disponibilites.ts::generateSlotsInRange`.
- **Rôle(s)** : `admin`/`superviseur` (`disponibilites.write`) ; autres
  rôles `none`/`read` selon `TAB_MATRIX`.
- **Actions possibles** : activer/désactiver chaque jour, définir
  horaires + durée de créneau (15/30/45/60 min), capacité par créneau,
  bouton **"Aperçu citoyen"** (prévisualise exactement ce qu'un citoyen
  verrait), historique des modifications (`peutVoirHistorique`,
  `journal.read`).
- **Parcours réel** : **secteur hôtel = écran totalement différent** —
  message "Ne s'applique pas à votre établissement" avec explication
  ("chaque chambre a déjà son propre tarif/horaires") + 2 CTA directs
  vers Services (module hors domaine) et Profil Entreprise (Domaine 1
  module 2, horaires Ouvert/Fermé). Très bon exemple d'aide contextuelle
  qui évite une confusion sectorielle plutôt que de laisser un écran
  vide ou inadapté.
- **États** : statut de configuration calculé (`ConfigStatus`) : `vide`
  ("Aucun jour ouvert") / `incomplet` ("Configuration incomplète") /
  `erreur` ("Erreur dans les horaires", ex. heure de fin ≤ heure de
  début) / `valide` ("Configuration valide").
- **Erreurs** : `"Erreur lors de l'enregistrement."` générique (x2,
  disponibilités et capacité par créneau).
- **Blocages** : aucun direct, mais rappel du Domaine 1 — ces horaires
  sont **distincts** de `institutions.horaires` (Profil Entreprise,
  badge public Ouvert/Fermé) : deux mécanismes séparés pour un concept
  proche, dette déjà documentée dans le code des deux fichiers.
- **Questions utilisateur potentielles** : "Différence entre ces
  horaires et ceux de Profil Entreprise ?" (confusion déjà repérée
  Domaine 1, voir registre T5 ci-dessous) / "Pourquoi mon écran
  Disponibilités ressemble à autre chose (hôtel) ?" (déjà bien répondu
  in-situ).
- **Aide existante** : **PARTIEL/BON** — statut de config avec libellés
  clairs, redirection sectorielle hôtel exemplaire, bouton Aperçu
  citoyen qui répond lui-même à "à quoi ça ressemble pour le client ?".
- **Aide manquante** : rien de critique — le point réel à traiter est
  la confusion transverse horaires publics vs créneaux réservables
  (registre), pas un manque propre à cet écran.
- **Dépendances** : Domaine 1 module 2 (horaires publics), module 4
  (Configuration Hôtel/Services pour le secteur hôtel), `rdv` (module 1,
  génère les créneaux proposés aux citoyens).
- **Source technique** : `DisponibilitesTab.tsx`, `lib/disponibilites.ts`.

##### 3. Centre de validation (`valider-rdv`)

- **Écran/route** : `ValiderRdvTab.tsx` (1171 lignes) ↔
  `PATCH /api/institution/paid-bookings/valider`.
- **Rôle(s)** : `admin`/`agent`/`superviseur` en écriture — palier
  exact non revérifié ligne à ligne ce passage (À VÉRIFIER, cohérent
  avec `TAB_MATRIX["valider-rdv"]` déjà cité en 1.2).
- **Actions possibles** : recherche par **code à 6 chiffres** (auto,
  dès le 6e chiffre saisi, aucun bouton) ; "Valider le paiement" /
  "Confirmer gratuitement" (prix=0) / "No-show" ; **"Annuler la
  validation"** (retour à `en_attente`, motif ≥5 caractères obligatoire,
  reversal complet) ; **"Annuler la réservation"** (statut `annule`,
  motif ≥5 caractères obligatoire) ; Timeline de la journée.
- **Parcours réel** : Code → Fiche citoyen (5 zones, dont historique
  honoré/absents) → Action. "Temps moyen" mesuré réellement mais
  **scopé à la session navigateur en cours**, jamais persisté — étiqueté
  "sur cette session" à l'écran (honnêteté déjà pratiquée).
- **États** : `BookingStatut` = `en_attente`/`confirme`/`termine`/
  `no_show`/`annule`. **"Code expiré" volontairement non construit**
  (aucune colonne `expires_at` sur `confirmation_code` — état non simulé).
- **Erreurs** : `"Réservation introuvable."` / `"Code introuvable"`
  (recherche) ; `"Erreur lors de la mise à jour."` (action générique) ;
  `"Erreur lors de l'annulation."` (x2, annulation validation/réservation) ;
  **cas spécial `hors_creneau`** — "Le citoyen est en avance" (titre +
  message serveur, via `lib/rdvGating.ts::creneauEstOuvert`) : erreur
  dédiée avec un vrai titre produit, pas un message générique.
- **Blocages** : validation refusée si le créneau n'est pas encore
  ouvert (`hors_creneau`) ; annulation (des 2 types) bloquée tant que le
  motif fait moins de 5 caractères.
- **Questions utilisateur potentielles** : "Pourquoi le système dit que
  le client est en avance ?" (`hors_creneau`, déjà un message dédié
  mais jamais approfondi) / "Différence entre Annuler la validation et
  Annuler la réservation ?" (la première remet en attente et permet de
  revalider, la seconde annule définitivement — distinction réelle
  jamais expliquée en langage produit, seulement déductible des deux
  libellés de bouton) / "Pourquoi dois-je écrire un motif pour
  annuler ?".
- **Aide existante** : **PARTIEL/BON** — messages d'erreur déjà
  spécifiques (surtout `hors_creneau`), honnêteté explicite sur le
  "temps moyen" scopé session.
- **Aide manquante** : distinction "Annuler la validation" vs "Annuler
  la réservation" — bon candidat article court, confusion réelle entre
  deux actions au nom proche (même famille que le registre T1/T2 mais
  sur des actions, pas des écrans — à ajouter au registre, voir T6).
- **Dépendances** : module 1 (section RDV Payants renvoie ici),
  `lib/rdvGating.ts`, `paid_bookings`/`recus` (reçu généré,
  `recu_id`, hors périmètre détaillé de ce domaine).
- **Source technique** : `ValiderRdvTab.tsx`,
  `api/institution/paid-bookings/valider/route.ts`.

##### 4. Mes clients (`mes-clients`)

- **Écran/route** : `MesClientsTab.tsx` (731 lignes) ↔
  `GET /api/institution/clients` (liste allégée, fiche détaillée
  chargée séparément à l'ouverture — correctif perf du 09/09/2026),
  `api/institution/notes-client`, `api/institution/avis/repondre`,
  `api/institution/rdv-historique` (envoi de rappel), `api/institution/messages`.
- **Rôle(s)** : `admin`/`agent`/`superviseur` (`full`,
  `mes_clients.write`) ; `dirigeant`/`comptable` `none`.
- **Actions possibles** : recherche, 5 tris (Récents/Fidèles/Nouveaux/
  Occasionnels/À réactiver) ; fiche client (timeline unifiée RDV +
  présence QR + paiement + avis + signalements admin + tâches + accès
  admin + messages) ; répondre à un avis ; ajouter une note (5 types :
  privée/publique/commentaire/observation/compte rendu) ; envoyer un
  rappel ; copier/appeler le téléphone ; ouvrir la messagerie ; voir la
  facturation.
- **Parcours réel** : badge "Client existant" recoupé côté onglet RDV
  (module 1) via `rdvCountByCitoyen` ; badge "VIP" si ≥5 RDV ; "Prochaine
  étape" mise en avant séparément du fil passé.
- **États** : `est_nouveau` (30 derniers jours) ; aucune facture
  (`factures_resume.total === 0`) → ligne simple sans carte.
- **Erreurs** : `"Erreur d'envoi"` (réponse avis, rappel) ;
  `"Erreur de sauvegarde"` (note).
- **Blocages** : `access="read"` masque bouton Répondre à un avis et le
  bloc d'ajout de note (lecture seule pure) — mais `isAdmin` conditionne
  séparément la visibilité des signalements et de l'historique d'accès
  dans la timeline (deux gates différentes sur le même écran, jamais
  expliquées).
- **Questions utilisateur potentielles** : "Pourquoi je ne vois pas
  certains éléments de la timeline ?" (gate `isAdmin` vs `access`,
  cumul non trivial) / "Comment un citoyen devient-il un client ici ?"
  (réponse réelle : dès son 1er RDV avec CETTE institution, jamais un
  citoyen de la plateforme en général — déjà dit dans le sous-titre de
  l'écran, bon point).
- **Aide existante** : **PARTIEL** — le sous-titre d'écran clarifie déjà
  bien le périmètre "clients"; le reste (double gate admin/access) non
  documenté.
- **Aide manquante** : rien de critique identifié — écran déjà bien
  auto-documenté par ses propres libellés.
- **Dépendances** : module 1 (`rdv`, badge "Client existant"), Domaine
  Finance (facturation, hors périmètre 2), Domaine Communication
  (messagerie).
- **Source technique** : `MesClientsTab.tsx`.

##### 5. Rendez-vous passés (`rdv-historique`)

- **Écran/route** : `RdvPasseTab.tsx` (446 lignes) ↔
  `GET/PATCH/POST /api/institution/rdv-historique`.
- **Rôle(s)** : `admin`/`superviseur` (`full`) ; `dirigeant` (`read`) ;
  `agent`/`comptable` `none`.
- **Actions possibles** : filtre période + recherche + 4 filtres statut
  (Tous/Terminé/Annulé/Absent) + tri + export CSV ; par ligne : "Marquer
  un suivi" (note texte) / "Rappeler ce client" (RDV en attente d'action) ;
  "Voir le dossier" (terminé) / "Détails" (annulé) ; menu "Copier la
  référence".
- **Parcours réel** : icône info permanente "Historique en lecture
  seule" à côté du titre — l'écran lui-même prévient qu'on ne peut pas
  modifier un RDV passé, seulement l'annoter.
- **États** : badge fusionné — **"Effectué"/"Honoré" du brief d'origine
  regroupés en un seul badge "Terminé"** (l'enum réel `statut_rdv` n'a
  qu'une valeur de complétion, décision assumée documentée dans le
  code) ; "Absent" dérivé de `presence_status`, pas du `statut` de base.
- **Erreurs** : `"Erreur de sauvegarde"` (suivi) ; `"Erreur d'envoi"`
  (rappel) ; `"Aucun rendez-vous à exporter"` (export vide, ton neutre
  pas une vraie erreur).
- **Blocages** : aucun direct — écran volontairement lecture seule sur
  le cœur du RDV (seuls suivi/rappel/référence sont actionnables).
- **Questions utilisateur potentielles** : "Pourquoi je ne peux pas
  modifier ce rendez-vous passé ?" (déjà répondu par l'icône info
  permanente — bon exemple) / "Différence entre ce filtre et celui de
  l'onglet Rendez-vous (module 1) ?" (`rdv` couvre tous statuts actifs,
  `rdv-historique` seulement terminé/annulé/absent — jamais dit
  explicitement, chevauchement possible dans la tête de l'utilisateur).
- **Aide existante** : **PARTIEL/BON** — le badge "lecture seule" et le
  regroupement Terminé/Honoré déjà pensés pour éviter la confusion.
- **Aide manquante** : clarifier la frontière avec l'onglet Rendez-vous
  (module 1) — candidat à ajouter au registre si ça revient ailleurs
  (T7, à confirmer aux domaines suivants).
- **Dépendances** : module 1 (`rdv`, même table sous-jacente, vue
  différente), module 4 (`mes-clients`, note "Suivi" partagée
  conceptuellement mais stockée séparément — À VÉRIFIER si vraiment
  distinct de `notes-client`).
- **Source technique** : `RdvPasseTab.tsx`.

##### 6. Scanner QR (`scanner`)

- **Écran/route** : rendu inline `layout.tsx` (~L5326-5371) — **historique
  de scans**, pas l'action de scanner elle-même (qui vit dans une modale
  globale ouverte par le bouton "Scanner" du header, hors `TabKey`,
  voir Domaine 1 note sur le header).
- **Rôle(s)** : `admin`/`agent` (`appointment.check_in`,
  `TAB_MATRIX.scanner`) ; autres rôles `none`.
- **Actions possibles** : consultation seule — liste des RDV dont
  `presence_status === "present"`, triée par confirmation la plus
  récente.
- **Parcours réel** : la confirmation de présence elle-même se fait
  ailleurs (modale Scanner du header) ; cet onglet n'est qu'un journal.
- **États** : liste vide vs peuplée.
- **Erreurs** : aucune — écran 100% lecture, pas d'appel réseau autre
  que la liste RDV déjà chargée par `rdv` (module 1).
- **Blocages** : aucun.
- **Questions utilisateur potentielles** : "Où est le bouton pour
  scanner ?" (pas sur cet écran — dans le header, confusion de nommage
  probable "Scanner QR" onglet vs bouton Scanner) / "Ce scan a-t-il
  vraiment confirmé le RDV ?" (déjà répondu par l'empty state, qui
  explique le lien de cause à effet).
- **Aide existante** : **PARTIEL** — l'empty state
  (`EmptyState variant="scanner"`) explique déjà bien le mécanisme
  ("Utilisez le bouton Scanner... l'historique se construira ici
  automatiquement").
- **Aide manquante** : clarifier que "Scanner" (bouton header, action)
  et "Scanner QR" (onglet, historique) sont deux choses différentes —
  confusion de nommage à surveiller sur les domaines suivants avant de
  l'ajouter au registre.
- **Dépendances** : module 1 (`rdv`, source des données affichées),
  modale Scanner du header (hors `TabKey`, non auditée dans ce domaine).
- **Source technique** : `app/[slug]/[id]/layout.tsx` L5326-5371.

##### 7. Mon code QR (`codeqr`)

- **Écran/route** : `CodeQrTab.tsx` (137 lignes) ↔
  `GET /api/institution/qr-provenance`, `lib/qrBrand.ts::generateBrandedQR`.
- **Rôle(s)** : accès via `TAB_MATRIX.codeqr` (`admin`/`agent` `full`
  — mêmes rôles que `scanner`, cohérent car les deux vivent sous la
  même icône header "Scanner").
- **Actions possibles** : imprimer, télécharger PNG HD, copier l'URL.
- **Parcours réel** : "preuve de valeur" — compteur réel de réservations
  attribuées à ce QR/lien (`?source=qr`), **masqué tant que non chargé**
  plutôt que d'afficher un "0" trompeur le temps du chargement (principe
  zéro donnée inventée appliqué ici explicitement).
- **États** : `qrCount === null` (chargement) vs valeur réelle.
- **Erreurs** : aucune visible — génération QR locale (jamais d'appel
  réseau qui peut échouer, hormis le compteur, silencieux en cas
  d'erreur `catch {}`).
- **Blocages** : aucun.
- **Questions utilisateur potentielles** : "Ce compteur inclut-il
  toutes mes réservations ou seulement celles via QR ?" (réponse réelle :
  uniquement celles avec `?source=qr`, donc scans + lien copié partagé —
  jamais dit explicitement, risque de surestimer/sous-estimer le rôle
  réel du QR physique).
- **Aide existante** : **ABSENT** sur l'explication du compteur ;
  **EXISTE** sur l'usage de base (sous-titre déjà clair : "Les citoyens
  scannent ce code pour accéder directement à votre profil").
- **Aide manquante** : courte clarification sur ce que mesure
  exactement le compteur (QR **et** lien copié, pas seulement le scan
  physique).
- **Dépendances** : `lib/institutionSlug.ts`, fiche publique
  institution (hors périmètre domaine institution).
- **Source technique** : `CodeQrTab.tsx`.

##### 8. Documents clients (`documents-clients`)

- **Écran/route** : `DocumentsClientsTab.tsx` (1136 lignes) ↔
  `api/institution/documents-citoyen/**`, constantes
  `lib/citoyenDocumentsConstants.ts`.
- **Rôle(s)** : `admin`/`comptable`/`superviseur` (`full`) —
  **comptable retiré le 16/09/2026** (changement documenté dans le code
  lui-même) ; `agent`/`dirigeant` `none`.
- **Actions possibles** : créer une demande (au client) ou un envoi (de
  document), "Commencer la vérification" (`recu`→`a_verifier`),
  Valider/Refuser (motif requis — non revérifié caractère par caractère
  ce passage, À VÉRIFIER si même seuil que ValiderRdvTab)/Archiver,
  télécharger, export CSV, filtres multiples (rapide/statut/type/
  client/demandeur/dates), recherche.
- **Parcours réel** : **7 statuts réels** confirmés dans le code —
  `en_attente`/`recu`/`a_verifier`/`valide`/`refuse`/`archive`/
  `disponible` (`DocumentStatut`, `lib/citoyenDocumentsConstants.ts`) —
  cohérent avec CLAUDE.md `/modules-livres`.
- **États** : KPI dérivés — "à traiter" (`recu`/`a_verifier`), "en
  attente" (`en_attente`), "reçus" (demandes non `en_attente`),
  "expirent bientôt" (`en_attente` + `date_limite` ≤ 3 jours) ; tendance
  8 jours par création (pas un historique de statut reconstruit — même
  limitation assumée que Signalements/Employés ailleurs).
- **Erreurs** : `"Erreur lors de l'action."` (générique, actions
  workflow) ; `"Erreur réseau."` (catch réseau séparé du catch serveur).
- **Blocages** : aucun rôle en lecture seule pure sur cet écran (2
  niveaux `full`/`none` seulement, contrairement à la plupart des
  autres écrans du domaine) — la vraie barrière reste serveur
  (`documents_clients.verify`/`.archive`).
- **Questions utilisateur potentielles** : "Pourquoi ce document
  expire-t-il ?" (`date_limite`, mécanisme non audité en détail ce
  passage — À VÉRIFIER) / "Différence entre Refuser et Archiver ?"
  (refuser = décision sur le contenu du document, archiver = fin de
  cycle après validation — distinction réelle jamais explicitée en
  langage produit, même famille que T6 ci-dessus) / "Le document
  original reste-t-il consultable après Archiver ?" (À VÉRIFIER,
  aperçu sécurisé mentionné dans CLAUDE.md mais pas revérifié ce passage).
- **Aide existante** : **PARTIEL** — KPI et badges déjà clairs, mais
  aucune explication des transitions de statut elles-mêmes.
- **Aide manquante** : article/aide contextuelle sur les 7 statuts et
  leurs transitions légales (`DOCUMENT_TRANSITIONS`, existant en code
  mais jamais exposé en langage produit à l'écran) — bon candidat
  connaissance transverse partagée avec le Domaine "Sécurité &
  conformité" (Signalements a le même besoin, à confirmer plus tard).
- **Dépendances** : `citoyen_documents` (côté citoyen, hors périmètre
  institution), module 4 (`mes-clients`, lien conceptuel client).
- **Source technique** : `DocumentsClientsTab.tsx`,
  `lib/citoyenDocumentsConstants.ts`.

---

#### Synthèse rapide — Domaine 2

**Aide existante par module** : EXISTE/remarquable (1 — Rendez-vous,
empty states par statut institution) · PARTIEL/BON (5 — Disponibilités,
Centre de validation, Mes clients, Rendez-vous passés, Scanner QR) ·
PARTIEL (1 — Documents clients) · ABSENT sur un point précis mais
écran globalement clair (1 — Mon code QR, compteur non expliqué).

**Constat transversal positif** : ce domaine contient les **meilleurs
exemples d'aide contextuelle déjà construite** dans tout l'audit à ce
stade (empty states par statut institution sur `rdv`, redirection
sectorielle hôtel sur `disponibilites`, icône "lecture seule" sur
`rdv-historique`, compteur "masqué tant que non chargé" sur `codeqr`).
Argument concret pour la Phase 4 : une partie du travail du Help Center
consistera à **généraliser un pattern déjà prouvé**, pas seulement à
écrire du contenu neuf.

**Nouvelles entrées au registre des connaissances transverses** (voir
tableau mis à jour ci-dessous) :
- T5 — Horaires publics (Profil Entreprise) vs créneaux réservables
  (Disponibilités) — confusion déjà repérée Domaine 1, confirmée
  revenir ici.
- T6 — Paires d'actions au nom proche mais au sens différent : "Annuler
  la validation" vs "Annuler la réservation" (Centre de validation),
  "Refuser" vs "Archiver" (Documents clients) — même famille de
  confusion (verbes d'action, pas des écrans), candidate à un pattern
  d'aide unique plutôt qu'un article par paire.

**À vérifier avant tout contenu** :
- Handlers `handleAccept`/`handleRefuse`/`handlePrendreEnCharge` (onglet
  Rendez-vous) — messages d'erreur non lus ce passage.
- Seuil exact du motif obligatoire sur Documents clients (Refuser) —
  À confirmer identique aux 5 caractères de ValiderRdvTab ou différent.
- Mécanisme réel de `date_limite`/expiration sur Documents clients.
- Storage/consultation d'un document après "Archiver" — aperçu
  sécurisé mentionné dans CLAUDE.md, non revérifié ce passage.
- Rôle exact autorisé sur `valider-rdv` (déduit de `TAB_MATRIX`, pas
  relu ligne à ligne dans `ValiderRdvTab.tsx`).

---

#### Domaine 3 — Services & offres (3 modules)

Périmètre : `services` (catalogue de ce que l'institution vend/offre),
`mes-offres` (marketing/visibilité, réservé aux partenaires approuvés),
`partenariat` (candidature + tableau de bord une fois approuvé — 2
composants pour 1 seul `TabKey`, `PartenariatTab.tsx`/`MonPartenariatTab.tsx`).

##### 1. Services (`services`)

- **Code réel** : `ServicesTab.tsx` (1288 lignes, 14 secteurs) **ou**
  `ServicesHotelTab.tsx` (847 lignes, secteur hôtel uniquement) — rendu
  conditionnel côté `layout.tsx` sur `activite_principale_code`, même
  patron que Configuration Hôtel (Domaine 1). Routes :
  `api/institution/services` (paid_services) et `api/institution/profile`
  (offre générale, `institutions.services` jsonb).
- **Rôle(s)** : `admin`/`comptable`/`superviseur` (`services.write`).
- **Comportement réel (14 secteurs, `ServicesTab.tsx`)** : **deux
  catalogues distincts sur le même écran**, explicitement annoncés
  comme différents l'un de l'autre dans le texte même de l'écran
  ("Totalement différent du catalogue **Services payants**") :
  1. **"Offre gratuite"** — ce que propose l'institution, **toujours
     gratuit**, réservable par les citoyens, visible sur la fiche
     publique (`institutions.services`).
  2. **"Services payants"** (`paid_services`) — catalogue tarifé, statut
     mappé sur le booléen réel `is_active` (Actif/Suspendu — **pas un
     enum à 4 valeurs**, précision explicite du code), champs
     complémentaires configurables (texte/tél/numéro, avec bascule
     "Requis"), taxe optionnelle, prix promo.
- **Comportement réel (secteur hôtel, `ServicesHotelTab.tsx`)** :
  remplace le catalogue par la gestion de **types de chambres**
  (nom, nombre d'unités, prix/nuit, description, **photos obligatoires**
  — "tous les champs obligatoires, pas de facultatif", retour Bryan
  20/08/2026 cité dans le code) et de **prestations** (4 types :
  Réservable/Commandable/Avec supplément/Horaires limités, chacun avec
  un aperçu textuel de ce que verra le client). Vidéo de présentation
  optionnelle, durée maximale contrôlée côté client.
- **Parcours réel** : sur `ServicesTab.tsx`, dropdown de catégorie qui
  **s'adapte** à la taxonomie réelle de l'institution (activités de sa
  catégorie) si elle en a une, avec repli sur l'ancienne liste
  `SECTEURS` sinon — jamais un dropdown vide qui bloquerait la création.
- **États** : `is_active` (actif/suspendu, services payants) ;
  `promo_actif` (prix barré). Aucun état "brouillon" contrairement à
  Mes Offres (module 2) — un service créé est immédiatement actif.
- **Erreurs** : `"Le nom est obligatoire"` (x2, services payants et
  offre générale) ; `"Le taux de taxe doit être un nombre positif"` ;
  côté hôtel : `"Le nom du type de chambre est obligatoire"` /
  `"Entrez un nombre de chambres valide"` / `"Entrez un prix par nuit
  valide en {DEVISE}"` / `"La description est obligatoire"` / `"Au
  moins une photo est obligatoire"` / `"Cette vidéo dure Xs — le
  maximum est de Ys."` / `"La famille est obligatoire"` (prestations).
- **Gaps** : aucune explication produit de la différence Offre
  gratuite/Services payants au-delà de la phrase déjà présente à
  l'écran (bonne base, pas un manque critique) ; aucune note trouvée
  ce passage sur *pourquoi* la validation prix>0 empêche les types
  "inclus"/"sur demande sans tarif" côté hôtel — limite connue et
  documentée dans le code lui-même, jamais exposée au prestataire.
- **Confusions transversales** : aucune nouvelle — cohérent avec T5
  (horaires) pour la partie horaires des prestations hôtel, qui réutilise
  explicitement le même widget que Profil Entreprise (bon signe, pas une
  divergence cette fois).
- **Moments d'aide identifiés** :
  - Écran → un admin non-hôtel cherche "chambres" → aucun résultat →
    réponse possible : rien à faire, cet écran est correct pour son
    secteur (pas un vrai moment d'aide, juste noté pour mémoire).
  - Écran Services Hôtel → prestataire tente d'ajouter une prestation
    "petit-déjeuner inclus" sans prix → bloqué par la validation prix>0
    → réponse possible : expliquer que "inclus"/"sans tarif" n'est pas
    encore pris en charge (limite produit réelle, pas un bug).
  - Écran Services (14 secteurs) → prestataire ne sait pas dans quel
    catalogue créer une offre → réponse possible : renvoyer au texte déjà
    présent à l'écran plutôt qu'un nouvel article (pattern à généraliser,
    pas dupliquer).
- **Questions utilisateur potentielles** : "Pourquoi je ne peux pas
  laisser un prix à 0 ou vide ?" (hôtel) / "Différence entre offre
  gratuite et service payant ?" (déjà répondu in-situ) / "Pourquoi mon
  service payant n'apparaît pas — dois-je le publier quelque part ?"
  (réponse réelle : non, aucune modération sur les services, contrairement
  à Mes Offres — jamais dit explicitement, confusion possible avec le
  module 2).
- **Aide existante** : **PARTIEL/BON** — la phrase de distinction des 2
  catalogues, les aperçus textuels par type de prestation hôtel
  ("Le client verra un bouton « Réserver »") sont déjà de la bonne aide
  contextuelle.
- **Aide manquante** : clarifier qu'aucun service (gratuit ou payant)
  n'est modéré par Yelen avant publication — contraste important avec
  Mes Offres (module 2) où **tout** passe par modération, jamais
  explicité côté Services.
- **Dépendances** : Domaine 1 (`lib/institutionTaxonomy.tsx`,
  catégorie/activité), Domaine 1 module 4 (Configuration Hôtel, gating
  sectoriel identique), `lib/horaires.ts` (partagé avec Profil
  Entreprise).
- **Source technique** : `ServicesTab.tsx`, `ServicesHotelTab.tsx`.

##### 2. Mes offres (`mes-offres`)

- **Code réel** : `MesOffresTab.tsx` (810 lignes) + 4 sous-composants —
  `MesOffresTable.tsx` (236, table desktop), `MesOffresOffreDetail.tsx`
  (141, fiche plein écran), `MesOffresAnalytics.tsx` (132, Top
  offres/Activité/Modération/Calendrier), `MesOffresIntro.tsx` (97,
  pop de valeur premier accès). Route `api/institution/offres`.
- **Rôle(s)** : `admin`/`superviseur` (`offres.write`/`offres.submit`).
  **Gate produit supplémentaire, non-RBAC** : accessible uniquement si
  `institutions.partenaire_statut === 'approuve'` (filtré côté nav,
  voir module 3) — un `admin` non partenaire ne voit pas cet onglet du
  tout, comme Configuration Hôtel (Domaine 1) est gaté par secteur.
- **Comportement réel** : **6 statuts réels** confirmés dans le code —
  `brouillon` → `en_attente_validation` (modération Yelen, jamais
  automatique) → `publiee` / `refusee` (avec `motif_refus`) ;
  `publiee` → `suspendue` (par le partenaire) → `republiee` (repasse en
  modération, pas de republication directe) ; tout statut sauf
  `archivee` → `archivee` ; seul `brouillon` peut être **supprimé**.
  Contenu structuré : titre, descriptions courte/longue, catégorie,
  genre, jusqu'à **4 "faits"** clé/valeur (`MAX_FAITS`), avantages/
  limites, image (max 10 Mo), CTA optionnel.
- **Parcours réel** : **pop de valeur au tout premier accès**
  (`MesOffresIntro`, localStorage `yelen224_offres_intro_vue`, montré
  une seule fois, **réouvrable via une icône info** à tout moment) —
  4 promesses, chacune explicitement rattachée à une fonctionnalité
  réelle ("jamais un argument marketing sans réalité derrière", commentaire
  du code). Aperçu smartphone en direct identique à ce que verra le
  citoyen, aussi bien en création qu'en consultation d'une offre
  existante (`OffreFicheContenu` réutilisé).
- **États** : CTR calculé uniquement si `vues > 0`, sinon `"—"` (jamais
  "0%" trompeur) ; delta "+N cette semaine" affiché **seulement si
  positif** (pas de "+0", pas de pourcentage inventé faute d'historique
  de statuts conservé — même principe zéro-donnée-inventée que le
  compteur QR du Domaine 2).
- **Erreurs** : `"Cette offre n'a pas pu être enregistrée."` (générique) ;
  `"Enregistré, mais la photo n'a pas pu être envoyée — réessayez plus
  tard."` (échec partiel explicitement distingué d'un échec total —
  bon exemple de message honnête sur un état intermédiaire).
- **Gaps** : "Calendrier de publication" affiché mais **stub explicite**
  ("Bientôt disponible — nécessite la planification de publication")
  — fonctionnalité non construite, honnêteté déjà pratiquée dans l'UI
  elle-même, rien à ajouter côté aide.
- **Confusions transversales** : nouvelle candidate — voir T7 (registre
  mis à jour ci-dessous) : "Suspendre" (partenaire, réversible via
  Republier) vs "Archiver" (tout statut, fin de cycle) sur Mes Offres
  rejoint la même famille que T6 (Refuser vs Archiver côté Documents
  clients) — paires d'actions au nom proche à traiter comme un seul
  pattern d'aide, pas des articles séparés par écran.
- **Moments d'aide identifiés** :
  - Écran → offre `refusee` avec motif → réponse déjà là
    (`motif_refus` affiché en évidence) → bon pattern à généraliser.
  - Écran → partenaire clique "Republier" une offre suspendue →
    surprise possible que ça repasse en modération plutôt que
    publication immédiate → réponse possible : le label du bouton
    ("Republier (modération)") le dit déjà — vérifier si ça suffit
    avant d'ajouter du contenu.
  - Écran → partenaire non approuvé cherche "Mes offres" dans la nav →
    absent → réponse possible : renvoyer vers l'onglet Partenariat
    (module 3) plutôt qu'un onglet invisible sans explication.
- **Questions utilisateur potentielles** : "Pourquoi mon offre a
  disparu après Suspendre ?" (elle reste dans "Suspendue", pas
  supprimée — à vérifier si assez clair pour un non-technicien) /
  "Combien de temps prend la modération ?" (aucun délai affiché ni
  trouvé dans ce passage, À VÉRIFIER) / "Pourquoi je ne vois pas
  l'onglet Mes offres ?" (gate partenaire, jamais expliqué côté nav
  elle-même — lien direct avec le moment d'aide ci-dessus).
- **Aide existante** : **EXISTE, remarquable** — `MesOffresIntro` est
  le meilleur exemple d'onboarding contextuel réutilisable trouvé
  jusqu'ici (pop de valeur au 1er accès + réouverture à la demande),
  aux côtés des empty states du Domaine 2.
- **Aide manquante** : délai de modération (si mesurable un jour, à
  vérifier plutôt qu'inventé) ; lien explicite entre l'absence de
  l'onglet et le statut partenariat.
- **Dépendances** : module 3 (`partenariat`, gate d'accès),
  `api/institution/journal` (Activité récente), fiche publique offre
  (`/offres/[id]`, hors périmètre institution).
- **Source technique** : `MesOffresTab.tsx` + 4 sous-composants listés
  ci-dessus.

##### 3. Partenariat (`partenariat` → `PartenariatTab.tsx`/`MonPartenariatTab.tsx`)

- **Code réel** : un seul `TabKey` (`partenariat`), **deux composants
  distincts** selon l'état : `PartenariatTab.tsx` (371 lignes, vitrine
  d'acquisition + formulaire de candidature) tant que
  `partenaire_statut !== 'approuve'` ; `MonPartenariatTab.tsx` (251
  lignes, tableau de bord de gestion) une fois approuvé — **décision
  produit explicite documentée dans le code** : "une institution
  approuvée quitte définitivement la vitrine d'acquisition... pour ne
  plus revoir le contenu marketing censé la convaincre."
- **Rôle(s)** : consultation ouverte plus largement, mais
  **candidature réservée à `access === "full"`** (en pratique `admin`,
  message explicite si non-admin : "Seul un administrateur de votre
  institution peut soumettre une demande de partenariat.").
- **Comportement réel** : 4 statuts (`aucun`/`en_attente`/`approuve`/
  `refuse`), chacun avec un libellé + icône + couleur dédiés. Toute
  statistique affichée (partenaires actifs, secteurs représentés, délai
  moyen de réponse, logos) vient d'agrégats réels
  (`api/institution/partenariat`) — **zéro chiffre marketing inventé**,
  commentaire explicite du code ("jamais de '1 245 institutions' ou
  logos fictifs").
- **Parcours réel** : demande via `DemandePartenariatOverlay` (formulaire
  séparé, non lu en détail ce passage — À VÉRIFIER son contenu exact) ;
  **3 notions demandées par le cahier des charges d'origine mais
  retirées faute de données réelles**, décision explicite de Bryan
  documentée dans le code : "Responsable Yelen" assigné (aucune table
  d'assignation), "Niveau partenaire" Gold/Silver (aucun barème),
  "Santé du partenariat" score/100 (aucune mesure de satisfaction
  réelle) — **exemple exemplaire du principe zéro-donnée-inventée
  appliqué à une décision produit**, pas seulement à un affichage.
- **États** : `statut === "refuse"` affiche le motif de refus s'il
  existe (`demande.motif_refus`) ; le statut "suspendu" **n'existe pas**
  dans `partenaire_statut` (reporté à un lot séparé, noté dans le code).
- **Erreurs** : aucune capturée directement dans les 2 fichiers lus
  (délèguent à `DemandePartenariatOverlay`, non audité ce passage —
  À VÉRIFIER).
- **Gaps** : le tableau de bord `MonPartenariatTab` renvoie vers "Mes
  offres" (module 2) via "Actions rapides" mais ne montre aucun lien
  retour explicite depuis Mes offres vers Partenariat — asymétrie mineure.
- **Confusions transversales** : T7 (voir Mes Offres ci-dessus,
  gate d'accès jamais expliquée côté nav) concerne directement cet
  écran comme source de la réponse.
- **Moments d'aide identifiés** :
  - Écran → demande refusée → le motif est déjà affiché → bon pattern,
    cohérent avec Documents institutionnels (Domaine 1) et Mes Offres.
  - Écran → non-admin ouvre l'onglet Partenariat pour candidater →
    bouton absent, message déjà clair ("Seul un administrateur...") —
    bon exemple à généraliser, pas à dupliquer en article.
  - Écran → institution approuvée cherche à revoir le contenu marketing
    d'origine (avantages, étapes) → non trouvé (volontairement retiré
    de sa vue) → réponse possible : les "Avantages partenaires" restent
    affichés dans `MonPartenariatTab` (réutilisation confirmée dans le
    code, `AVANTAGES_SIDEBAR` partagé) — probablement suffisant, à
    confirmer si des tickets le contredisent plus tard.
- **Questions utilisateur potentielles** : "Pourquoi mon statut
  partenaire n'apparaît nulle part avec un score ou un niveau ?"
  (jamais construit, décision assumée — bon candidat à documenter
  honnêtement plutôt que de laisser deviner une fonctionnalité absente) /
  "Qui est mon contact chez Yelen ?" (aucun "Responsable Yelen" assigné
  — répondu implicitement par le bouton "Contacter Yelen" en Actions
  rapides, jamais nommé explicitement).
- **Aide existante** : **PARTIEL/BON** — bandeau de statut toujours
  visible en premier, motif de refus affiché, message de restriction de
  rôle déjà clair.
- **Aide manquante** : rien de critique une fois les 3 notions retirées
  du périmètre reconnues comme une décision produit assumée (pas un
  gap à combler) — à documenter honnêtement si des questions reviennent
  ("pourquoi pas de score/niveau partenaire") plutôt qu'à construire.
- **Dépendances** : module 2 (`mes-offres`, déblocage + renvoi mutuel),
  Domaine 1 module 2 (site web officiel requis pour candidater, critère
  affiché mais validation exacte non vérifiée ce passage — À VÉRIFIER).
- **Source technique** : `PartenariatTab.tsx`, `MonPartenariatTab.tsx`.

---

#### Synthèse rapide — Domaine 3

**Aide existante par module** : EXISTE/remarquable (1 — Mes Offres,
pop de valeur `MesOffresIntro`) · PARTIEL/BON (2 — Services,
Partenariat).

**Patterns UX déjà réussis à retenir comme référence** (ne pas
réécrire en article, généraliser le mécanisme) :
- `MesOffresIntro` — pop de valeur au premier accès, réouvrable à la
  demande via une icône info. Même famille que le Setup Center
  (Domaine 1) et les empty states du Domaine 2, mais avec un angle
  différent : vendre la valeur d'un écran, pas seulement expliquer
  comment l'utiliser.
- Motif de refus toujours affiché en évidence dès qu'il existe
  (Documents institutionnels, Domaine 1 ; Mes Offres et Partenariat,
  Domaine 3) — pattern cohérent sur 3 domaines maintenant.
- Messages de restriction de rôle explicites et non génériques
  ("Seul un administrateur... peut soumettre une demande").

**Confusions transversales** : nouvelle entrée T7 ajoutée au registre
(gate d'accès Mes Offres ↔ statut Partenariat jamais expliqué côté
nav) ; T5/T6 confirmées pertinentes sur ce domaine sans réécriture.

**À vérifier avant tout contenu** (s'ajoute aux points ouverts des
Domaines 1 et 2, aucun refermé) :
- Contenu exact de `DemandePartenariatOverlay` (formulaire de
  candidature), non lu ce passage.
- Validation exacte du "site web officiel requis" pour candidater
  (critère affiché, mécanisme non vérifié).
- Existence d'un délai de modération mesurable pour les offres
  (aucune source trouvée ce passage — ne pas en inventer un).
- Raison exacte pour laquelle la validation prix>0 bloque les
  prestations hôtel "incluses"/"sans tarif" (limite documentée comme
  un choix de portée, pas creusée plus loin ce passage).

---

#### Domaine 4 — Communication & réputation (6 modules)

Périmètre : `communication` (Annonces), `communaute-pro` (Yelen
Community), `messagerie`, `support` (ticketing humain, déjà
partiellement audité en 1.8/1.9), `avis-reputation` (Santé du compte),
`questions-clients`. Domaine le plus volumineux en code de l'audit à ce
stade (~6200 lignes cumulées, `CommunauteProTab.tsx` seul fait 2611
lignes) — lecture ciblée sur les 2 plus gros fichiers (intro, types,
statuts, erreurs), lecture complète sur les 4 autres.

##### 1. Annonces (`communication` → `CommunicationTab.tsx`, 1464 lignes)

- **Code réel** : ↔ `api/institution/annonces` (écriture service_role
  exclusive — `annonces` n'a aucune policy RLS d'écriture, corrigé
  après audit du 20/07/2026), `api/institution/annonces/stats`.
- **Rôle(s)** : `admin`/`superviseur` (`communication.publish_annonce`).
- **Comportement réel** : 5 statuts (`publiee`/`brouillon`/`planifiee`/
  `terminee`/`archivee`), **`terminee` est dérivé** (`realStatut()`) —
  une annonce `publiee` dont `date_expiration` est dépassée s'affiche
  "Terminée" sans jamais être réécrite en base, même mécanique que le
  badge "Non traité" du Domaine 2 (rdv `en_retard`). KPI (vues,
  citoyens touchés, interactions, taux d'interaction) avec delta
  vs période précédente.
- **Parcours réel** : formats riches (carrousel/PDF/vidéo) — colonnes
  posées en base mais **sélecteur/upload pas encore construits**,
  honnêteté du commentaire de code ("arrivent au lot suivant").
- **États** : `echantillon_suffisant` (flag explicite sur les stats,
  pour ne jamais afficher un taux d'interaction basé sur trop peu de
  données comme s'il était fiable — **encore une application du
  principe zéro-donnée-inventée**, cette fois à un seuil statistique).
- **Erreurs** : `"Le titre et le contenu sont obligatoires."`.
- **Gaps** : **audience par type de citoyen (patients/clients...)
  explicitement écartée** — "aucune classification citoyen n'existe en
  base" (décision Bryan 20/07/2026, documentée dans le code) — ne pas
  suggérer cette fonctionnalité dans un futur contenu d'aide, elle
  n'existe pas et ce n'est pas prévu. Idem pour "clics/ouvertures/
  sources de découverte" (`nb_clics` jamais incrémenté pour les
  annonces).
- **Confusions transversales** : aucune nouvelle.
- **Moments d'aide identifiés** :
  - Écran → une annonce publiée "disparaît" visuellement (passée en
    Terminée) sans action de l'institution → réponse possible :
    expliquer que c'est automatique à l'expiration, pas une suppression.
  - Écran → institution cherche à cibler un type précis de citoyen →
    absent → réponse possible : dire explicitement que ce n'est pas
    construit (honnêteté), pas laisser deviner.
- **Questions utilisateur potentielles** : "Pourquoi mon annonce est
  passée en Terminée toute seule ?" / "Puis-je cibler un type de
  client précis ?" (non, réponse honnête à donner plutôt qu'à éluder).
- **Aide existante** : **ABSENT** sur ces deux points précis, écran
  globalement clair par ailleurs (KPI et statuts lisibles).
- **Aide manquante** : clarifier le statut "Terminée" dérivé ; énoncer
  honnêtement les limites actuelles (ciblage, clics) plutôt que de
  laisser un vide qui invite à chercher une fonctionnalité absente.
- **Dépendances** : aucune vers les autres modules de ce domaine —
  écran autonome.
- **Source technique** : `CommunicationTab.tsx`,
  migration `20260720000009_annonces_engagement.sql`.

##### 2. Yelen Community (`communaute-pro` → `CommunauteProTab.tsx`, 2611 lignes)

- **Code réel** : ↔ `api/institution/communaute-posts`. Lecture ciblée
  (intro + types + états de candidature) vu le volume — reste de
  l'écran (création en popup, planification) non relu ligne à ligne,
  **À VÉRIFIER** pour le détail fin des erreurs de ces flux.
- **Rôle(s)** : `admin`/`superviseur` (`communaute_pro.publish`).
- **Comportement réel** : **architecture de candidature identique à
  Partenariat (Domaine 3)** — mêmes 4 statuts
  (`aucun`/`en_attente`/`approuve`/`refuse`), même mirroring
  explicitement documenté dans le code ("retour Bryan : même flux que
  demande de partenariat"), écran pitch tant que
  `institutions.communaute_statut !== 'approuve'`. Une fois approuvé,
  gestion de posts (4 statuts : `en_attente_validation`/`publiee`/
  `refusee`/`planifiee`), catégories partagées avec le fil citoyen
  (`lib/communauteCategories.ts`) sauf 2 explicitement retirées pour ne
  pas doublonner Offres/Annonces (décision produit, pas un oubli).
  Planification de publication réelle (`scheduled_at` + job cron) —
  **contrairement au stub "Bientôt disponible" de Mes Offres
  (Domaine 3)**, ici la fonctionnalité existe vraiment.
- **Parcours réel** : chaque état de candidature a un champ
  `prochaineEtape` **qui change selon le rôle de l'utilisateur** — un
  non-admin lit "Un administrateur de votre institution peut soumettre
  une demande", un admin lit l'action concrète à faire. Excellent
  exemple d'aide contextuelle qui s'adapte au contexte réel de qui la
  lit, pas un texte générique.
- **États** : timeline réelle `soumis_le`/`valide_le`/`traite_le` —
  `traite_le` posé sur les 2 décisions (approbation ET refus, ajouté
  16/09/2026) pour ne jamais fabriquer une date de refus avant son
  existence réelle en base.
- **Erreurs** : "Catégorie · requise" (inline, création de post) ;
  rappel explicite dans un commentaire de code que la planification
  "retarde uniquement l'entrée en file de modération, jamais la
  validation elle-même" — un post planifié n'est jamais publié
  automatiquement sans passer par la modération Yelen.
- **Gaps** : aucun nouveau repéré dans la portion lue.
- **Confusions transversales** : **candidate T8** (registre mis à
  jour) — Communauté Pro et Mes Offres (Domaine 3) partagent la même
  mécanique "planification" avec un comportement différent (l'une
  fonctionne réellement, l'autre est un stub) : risque de confusion si
  un prestataire généralise son expérience de l'une à l'autre.
- **Moments d'aide identifiés** :
  - Écran → non-admin ouvre l'onglet sans pouvoir candidater →
    `prochaineEtape` répond déjà correctement — pattern à généraliser,
    pas un gap.
  - Écran → post planifié → prestataire suppose qu'il sera publié
    automatiquement à la date choisie → réponse possible : clarifier
    que la modération intervient quand même à cette date-là (déjà dit
    en commentaire de code, à vérifier si assez visible à l'écran
    lui-même — **À VÉRIFIER**, le texte utilisateur exact n'a pas été
    confirmé dans la portion lue).
- **Questions utilisateur potentielles** : "Pourquoi ma publication
  programmée n'est pas encore visible à l'heure prévue ?" (modération
  peut prendre du temps même après la date programmée) / "Différence
  entre Communauté Pro et Annonces ?" (catégories volontairement
  disjointes, jamais expliqué côté produit — nouvelle confusion
  candidate, voir T9 ci-dessous).
- **Aide existante** : **PARTIEL/BON** — `prochaineEtape` est un très
  bon pattern, aligné sur T7 (Partenariat) en mieux (contextualisé par
  rôle en plus du statut).
- **Aide manquante** : clarifier le comportement réel de la
  planification (module réel, contrairement à Mes Offres) et la
  frontière avec Annonces/Communication.
- **Dépendances** : Domaine 3 module 3 (Partenariat, même architecture
  de candidature) ; Domaine 3 module 2 (Mes Offres, confusion T8 sur la
  planification) ; module 1 de ce domaine (Annonces, frontière de
  catégories, T9).
- **Source technique** : `CommunauteProTab.tsx` (lecture ciblée, pas
  exhaustive).

##### 3. Messagerie (`messagerie` → `MessagerieTab.tsx`, 842 lignes)

- **Code réel** : ↔ `api/institution/conversations*` (nouveau modèle,
  chantier "Messagerie V2" 06/09/2026) — remplace l'ancien modèle "une
  conversation = un RDV" par de vraies entités `conversations`
  (plusieurs fils par citoyen, statut indépendant du RDV lié,
  assignable à un membre). L'ancienne route `api/institution/messages`
  reste utilisée ailleurs (Mes Clients Domaine 2, upload d'image ici).
- **Rôle(s)** : `admin`/`agent`/`superviseur` (`mes_clients.write`,
  même palier que Mes Clients).
- **Comportement réel** : 3 statuts (`ouverte`/`en_attente`/`fermee`).
  **Envoi d'image limité aux conversations liées à un RDV** (ancienne
  route réutilisée pour l'upload) — bouton caméra **désactivé avec un
  message explicite** plutôt qu'un échec silencieux si la conversation
  n'est liée à aucun RDV. Panneau de contexte client (profil + RDV lié
  + assignation) visible uniquement ≥1280px — limitation documentée
  comme volontaire pour ce lot, pas un bug.
- **Parcours réel** : simplifications assumées et **documentées
  explicitement plutôt que cachées** (citation du code : "documentées
  plutôt que cachées") — ex. pas encore de compteur "8 conversations /
  5 RDV" par client.
- **États** : `non_lus` par conversation, `dernier_message_type`
  (texte/image).
- **Erreurs** : `"Erreur d'envoi de l'image."` / `"Erreur d'envoi.
  Réessayez."`.
- **Gaps** : panneau contexte client absent <1280px sans bouton
  d'ouverture manuel — toutes les actions restent accessibles via le
  menu "⋮" mais rien n'indique explicitement où elles sont passées à
  un utilisateur habitué au panneau desktop.
- **Confusions transversales** : aucune nouvelle.
- **Moments d'aide identifiés** :
  - Écran → bouton caméra grisé sur une conversation sans RDV lié →
    déjà un message explicite (à vérifier son wording exact — **À
    VÉRIFIER**, non lu précisément) → bon pattern si confirmé complet.
  - Écran <1280px → prestataire cherche le panneau de contexte client
    habituel → absent → réponse possible : signaler que tout reste
    accessible via le menu "⋮".
- **Questions utilisateur potentielles** : "Pourquoi je ne peux pas
  envoyer de photo dans cette conversation ?" (pas de RDV lié — message
  déjà prévu, à confirmer suffisant) / "Où est passé le panneau client
  sur mon écran ?" (largeur <1280px).
- **Aide existante** : **PARTIEL/BON** — honnêteté documentée du code
  sur les limitations, message explicite prévu sur la caméra désactivée.
- **Aide manquante** : signalement clair du repli menu "⋮" sur petits
  écrans.
- **Dépendances** : Domaine 2 module 4 (Mes Clients, `api/institution/
  messages` partagé pour le mode historique).
- **Source technique** : `MessagerieTab.tsx`, `lib/messagerie.ts`.

##### 4. Support Yelen (`support` → `SupportYelenTab.tsx`, 701 lignes)

- **Code réel** : déjà largement audité en Phase 1 (section 1.8) — ce
  passage complète avec les erreurs/catégories non couvertes alors.
  ↔ `api/institution/support/tickets/**`, SSE pour le temps réel
  (pas de Realtime Supabase direct, institution sans session Supabase
  Auth).
- **Rôle(s)** : ouvert aux 5 rôles (`TAB_MATRIX.support = "full"`
  partout, déjà noté Phase 1 — "hors RBAC métier, contacter Yelen n'est
  pas une donnée citoyenne sensible").
- **Comportement réel** : mêmes 4 statuts que le ticketing citoyen déjà
  documenté (`attente_agent`/`en_cours`/`resolu`/`cloture`), agent
  humain uniquement, catégories propres à l'institution
  (`SUPPORT_CATEGORIES_INSTITUTION`, distinctes des catégories citoyen).
- **États/Erreurs** : `"Erreur d'envoi."` générique sur l'envoi de
  message — moins spécifique que d'autres écrans de ce domaine
  (Communication, Communauté Pro), **À VÉRIFIER** si d'autres messages
  plus précis existent ailleurs dans le fichier (portion non relue).
- **Gaps** : déjà notés Phase 1 — pas d'envoi d'image sur les tickets
  (limitation assumée, cohérente avec le citoyen).
- **Confusions transversales** : aucune nouvelle — rappel que ce
  ticketing est le niveau "support humain" du modèle à 4 niveaux
  (voir méthode consolidée en tête de document), pas un pattern d'aide
  à généraliser ailleurs.
- **Moments d'aide identifiés** : ce module **est lui-même** la
  réponse "support humain" pour tous les moments d'aide non résolus
  ailleurs dans ce domaine — pas de nouveau moment d'aide propre à lui,
  sinon la disponibilité déjà notée Phase 1 (indicateur Disponible/
  Fermé dérivé d'horaires codés en dur, jamais confronté à un vrai SLA).
- **Questions utilisateur potentielles** : déjà couvertes Phase 1
  (section 3).
- **Aide existante** : **EXISTE** (c'est le niveau "support humain"
  lui-même).
- **Aide manquante** : rien de nouveau ce passage.
- **Dépendances** : aucune nouvelle vers ce domaine.
- **Source technique** : `SupportYelenTab.tsx`, `lib/supportTickets.ts`
  (déjà référencés Phase 1).

##### 5. Santé du compte / Avis (`avis-reputation` → `AvisReputationTab.tsx`, 440 lignes)

- **Code réel** : ↔ `api/institution/avis-reputation/status`,
  `api/institution/avis-reputation/liste`, `api/institution/avis/repondre`
  (partagé avec Mes Clients, Domaine 2). Moteur de score :
  `lib/reputationScore.ts` (déjà référencé CLAUDE.md
  `/chantiers-citoyen-clos`).
- **Rôle(s)** : `admin`/`agent`/`superviseur` (`full`, `avis.repondre`
  pour la réponse) ; `dirigeant` (`read`).
- **Comportement réel** : score 0-100 + niveau (Platinum/Gold/Silver/
  Danger), combinant plusieurs signaux (pas seulement la note moyenne)
  — **"pas un système de sanction"**, commentaire explicite du code.
  `alerteAdmin` (niveau Danger) affiche un bandeau qui prévient
  explicitement **"aucune fermeture automatique... une décision
  humaine sera prise après examen"** — même discipline que
  Signalements/case management déjà documentée ailleurs dans le projet.
- **Parcours réel** : **écran vide en dessous d'un seuil minimum
  d'avis** (`minAvisRequis`, ex. 3) — état vide **conçu**, pas un
  message brut : illustration + barre de progression "X avis reçus sur
  Y nécessaires" + description de ce que l'écran affichera une fois le
  seuil atteint. Section "Avis détaillés" reste accessible même sous
  ce seuil (recherche, filtres, réponse).
- **États** : `echantillon`/seuil minimum avant d'afficher un score
  (même discipline que `echantillon_suffisant` sur Annonces, module 1
  de ce domaine — principe répété une 3e fois dans ce seul domaine).
- **Erreurs** : `"Erreur de chargement"` / `"Erreur d'envoi"`.
- **Gaps** : aucun nouveau — écran très complet et déjà honnête sur ses
  propres limites (seuil, pas de sanction automatique).
- **Confusions transversales** : aucune nouvelle.
- **Moments d'aide identifiés** :
  - Écran → prestataire tombe en dessous du seuil minimum d'avis →
    déjà un état vide conçu avec barre de progression → excellent
    pattern à généraliser (voir registre patterns ci-dessous).
  - Écran → alerte Danger affichée → prestataire s'inquiète d'une
    fermeture imminente → déjà rassuré explicitement dans le bandeau
    lui-même → bon pattern, rien à ajouter.
- **Questions utilisateur potentielles** : "Comment le score est-il
  calculé exactement ?" (formule réelle existe dans
  `lib/reputationScore.ts`, jamais vulgarisée à l'écran — bon candidat
  article/connaissance transverse, pas juste un moment d'aide ponctuel).
- **Aide existante** : **EXISTE, remarquable** — état vide sous seuil
  et bandeau d'alerte sont deux très bons patterns.
- **Aide manquante** : vulgarisation de la formule de score (0-100,
  pondérations) — actuellement seulement dans le code, jamais exposée
  au prestataire même en langage simplifié.
- **Dépendances** : Domaine 2 module 4 (Mes Clients, même route de
  réponse aux avis) ; `lib/reputationScore.ts`.
- **Source technique** : `AvisReputationTab.tsx`, `lib/reputationScore.ts`.

##### 6. Questions des clients (`questions-clients` → `QuestionsClientsTab.tsx`, 167 lignes)

- **Code réel** : ↔ `api/institution/questions` (table
  `questions_institution`) — **système séparé de Messagerie** (table
  `messages`), décision explicite documentée dans le code : "deux
  systèmes distincts, pas de mélange."
- **Rôle(s)** : `admin`/`agent`/`superviseur` (`questions.repondre`).
- **Comportement réel** : questions publiques posées par un citoyen
  **sur la fiche publique avant RDV** — une fois répondue, la réponse
  devient **visible publiquement** sur cette même fiche (contrairement
  à Messagerie, privée). 2 filtres (En attente/Répondues) + compteurs.
- **Parcours réel** : réponse en ligne simple (input + bouton), pas de
  brouillon multi-étape contrairement à d'autres écrans du domaine.
- **États** : `readOnly` (agent sans droit de réponse) affiche "En
  attente de réponse." sans champ de saisie, plutôt qu'un champ
  désactivé silencieux.
- **Erreurs** : `"Erreur lors de l'envoi."`.
- **Gaps** : aucun — écran le plus simple et le plus clair du domaine,
  sous-titre déjà explicite sur la nature publique de la réponse.
- **Confusions transversales** : **candidate T9** (voir ci-dessous) —
  Questions clients (publique, avant RDV) vs Messagerie (privée) vs
  Avis (public, après RDV) : 3 canaux de communication citoyen↔
  institution avec des règles de visibilité différentes, jamais
  comparés explicitement nulle part dans le produit.
- **Moments d'aide identifiés** :
  - Écran → prestataire répond sans réaliser que c'est visible
    publiquement → déjà annoncé dans le sous-titre ET rappelé au moment
    de la réponse ("visible publiquement sur la fiche") → très bon
    pattern, doublement renforcé.
- **Questions utilisateur potentielles** : "Cette réponse est-elle
  privée ou publique ?" (déjà répondu 2 fois dans l'écran — bon signe).
- **Aide existante** : **EXISTE** — répétition intentionnelle du
  caractère public à 2 endroits de l'écran, pattern solide.
- **Aide manquante** : rien de propre à cet écran — le vrai besoin est
  la comparaison transverse des 3 canaux (T9).
- **Dépendances** : module 3 de ce domaine (Messagerie, distinction
  explicite) ; Domaine 2 module 4 (Mes Clients, avis).
- **Source technique** : `QuestionsClientsTab.tsx`.

---

#### Synthèse rapide — Domaine 4

**Aide existante par module** : EXISTE/remarquable (2 — Santé du
compte, Questions clients) · PARTIEL/BON (3 — Communauté Pro,
Messagerie, Support déjà couvert Phase 1) · ABSENT sur des points
précis (1 — Annonces, gaps ciblés).

**Nouveaux patterns UX identifiés** (ajoutés au registre dédié
ci-dessous, pas réécrits en articles) : état vide sous seuil avec barre
de progression (Avis), champ `prochaineEtape` contextualisé par rôle
(Communauté Pro), rappel de visibilité publique répété deux fois
(Questions clients), bouton désactivé avec message explicite plutôt
qu'échec silencieux (Messagerie, caméra).

**Nouvelles confusions transversales** : T8 (mécanique de
planification présente sur 2 écrans avec un comportement différent —
réelle sur Communauté Pro, stub sur Mes Offres) ; T9 (3 canaux de
communication citoyen↔institution aux règles de visibilité différentes
jamais comparés). T7 confirmé ne pas réapparaître sous une nouvelle
forme ce domaine (les 2 gates d'accès trouvées ici, Communauté Pro et
Support, sont soit bien expliquées `prochaineEtape` soit ouvertes à
tous — pas un nouveau cas de "disparition silencieuse").

**Constat transversal fort de ce domaine** : le principe **zéro-donnée-
inventée**, déjà établi comme référence sur Partenariat (Domaine 3),
se retrouve **3 fois** dans ce seul domaine (`echantillon_suffisant`
sur Annonces, seuil minimum d'avis sur Avis, ciblage citoyen
explicitement écarté sur Annonces) — ce n'est pas un principe isolé
mais une discipline produit systématique, confirmée sur 4 domaines
maintenant.

**À vérifier avant tout contenu** (s'ajoute aux points ouverts des
Domaines 1-3, aucun refermé) :
- Texte exact affiché au prestataire sur la modération d'un post
  Communauté Pro planifié (comportement confirmé en commentaire de
  code, formulation UI non confirmée).
- Détail complet des erreurs de création/planification de post
  Communauté Pro (fichier lu partiellement, 2611 lignes).
- Message exact du bouton caméra désactivé sur Messagerie (non lu
  précisément).
- Autres messages d'erreur possibles sur Support Yelen au-delà de
  "Erreur d'envoi." (portion non relue).

---

#### Domaine 5 — Équipe & organisation (5 modules)

Périmètre : `equipe` (RBAC dashboard), `journal` (audit log), `collaboration`
(DM interne membre↔membre), `clock-in-shift` (pointage employés,
population distincte), `espace-travail` (5 sections : Agenda/Tâches/
Documents/Projets/Notes — sous-produit interne à part entière, 5688
lignes de code réparties sur 13 fichiers). Domaine le plus vaste en
volume de code de tout l'audit à ce stade — lecture ciblée
(intro + définitions de types/statuts + erreurs) sur les 3 plus gros
fichiers (`ClockInShiftTab.tsx` 2698 lignes déjà largement documenté
CLAUDE.md `/modules-livres`, `CollaborationTab.tsx` 1028,
`CommunauteProTab.tsx`-scale `EspaceTravailTab` + sous-dossier),
lecture plus complète sur `EquipeTab.tsx` (1081) et `JournalTab.tsx`
(949, déjà documenté CLAUDE.md `/chantier-journal-activite`).

##### 1. Équipe & Accès (`equipe` → `EquipeTab.tsx`, 1081 lignes)

- **Code réel** : ↔ `api/institution/membres`. **Distinct de Clock In
  Shift par design**, rappelé explicitement en tête de fichier : ici,
  qui a accès au **dashboard Yelen** (RBAC) ; Clock In Shift, qui est
  **pointé** comme employé — un employé peut n'avoir aucun compte ici,
  un compte ici peut ne jamais être un employé pointé (ex. dirigeant
  externe).
- **Rôle(s)** : `admin` (`equipe.write`) ; `superviseur`/`dirigeant`
  (`equipe.read_full`).
- **Comportement réel** : **4 statuts dérivés** (pas un enum en base) —
  `verrouille` (`locked_until` dans le futur — **ferme le point ouvert
  du Domaine 1** : le mécanisme existe bien, alimenté par
  `failed_attempts`/`locked_until`, migration `20260805000016` ; le
  seuil exact de tentatives avant verrouillage reste **À VÉRIFIER**,
  logique côté route de login non lue ce passage) / `suspendu`
  (`!actif`) / `invitation` (`doit_changer_pin && !derniere_connexion`
  — **proxy assumé**, pas un vrai système d'invitation par lien/email
  avec expiration, décision documentée explicitement dans le code) /
  `actif`. Rôles personnalisés (`acces_restreints`, Domaine `DOMAINE_KEYS`
  déjà vus en 1.2) gérés ici avec un résumé "permissions incluses" par
  rôle.
- **Parcours réel** : **"Badge QR"** — génération d'un QR personnel par
  membre qui active un **poste d'accueil physique** pour scanner la
  présence des clients (`generateBrandedQR`, révocable). **3e système
  "QR" du produit**, sans rapport avec le QR public institution
  (Domaine 2, `codeqr`) ni le scan de présence lui-même (Domaine 2,
  `scanner`) — voir **T10** (registre mis à jour).
- **États** : révocation de session = message produit direct
  ("Ce compte perd l'accès au dashboard Yelen immédiatement"), pas un
  jargon technique.
- **Erreurs** : `"Erreur de création"` / `"Erreur de suppression"`.
- **Gaps** : aucune colonne téléphone/email — décision assumée
  documentée ("ce n'est pas un annuaire de contact, juste un centre
  d'accès RBAC"), pas un manque à corriger.
- **Confusions transversales** : T10 (badge QR) ; rappel T1/T2 (ce
  module est justement la source de vérité qui devrait clarifier la
  distinction Profil Responsable/Administration & accès/Équipe, jamais
  fait aujourd'hui).
- **Moments d'aide identifiés (M)** :
  - Écran → admin ne comprend pas pourquoi un membre reste "En attente"
    longtemps → réponse possible : "Invitation en attente" est un
    proxy (pas de relance automatique, pas d'expiration) — le membre
    doit se connecter une première fois avec son PIN initial pour
    sortir de cet état, jamais un lien à cliquer.
  - Écran → admin génère un badge QR sans comprendre à quoi il sert
    exactement → réponse déjà bien faite in-situ ("Ce QR personnel
    active le poste d'accueil de {prénom}...").
- **Questions utilisateur potentielles** : "Pourquoi ce membre reste
  bloqué en invitation ?" / "Différence entre ce badge QR et le QR de
  mon établissement ?" (T10) / "Combien de tentatives avant
  verrouillage ?" (À VÉRIFIER).
- **Aide existante** : **PARTIEL/BON** — messages de révocation et de
  badge QR déjà clairs et concrets.
- **Aide manquante** : rien de critique une fois T1/T2/T10 traités
  comme connaissances transverses (pas des manques propres à cet
  écran).
- **Dépendances** : Domaine 1 (T1/T2, RBAC de base) ; Domaine 2 (T10,
  QR) ; Domaine 5 module 4 (Clock In Shift, distinction de population).
- **Source technique** : `EquipeTab.tsx`.

##### 2. Journal d'activité (`journal` → `JournalTab.tsx`, 949 lignes)

- **Code réel** : déjà largement documenté CLAUDE.md
  `/chantier-journal-activite` (Lots A-G clos, H-I ouverts) — ce
  passage vérifie plutôt qu'il redécouvre. Confirmé dans le code lu :
  `audit_id` séquentiel, `scoreRisque()` (`lib/journalTaxonomie.ts`),
  résumé "phrases" déterministe (type `Resume`, zéro LLM — cohérent
  avec `/stack-specifique`), export CSV.
- **Rôle(s)** : `admin`/`superviseur`/`dirigeant` (`journal.read`,
  `journal.export` — mêmes rôles pour les deux, l'export étant traité
  comme une lecture).
- **Comportement réel** : timeline groupée par jour, filtres catégorie/
  membre/date, fiche détail (ancienne/nouvelle valeur pour les
  modifications), niveau de gravité par entrée (dont `"erreur"`, rouge).
- **Erreurs** : `"Erreur de chargement"` / `"Erreur lors de l'export"` /
  `"Erreur réseau lors de l'export"` (3 messages distincts pour le même
  export selon la cause — bon niveau de précision).
- **Gaps** : Lots H (géolocalisation IP→ville, réseau interne, appareil
  connu) et I (responsive final) confirmés **non commencés** —
  cohérent avec CLAUDE.md, pas une nouvelle découverte.
- **Confusions transversales** : aucune nouvelle.
- **Moments d'aide identifiés (M)** :
  - Écran → prestataire voit une entrée classée "Erreur"/score de
    risque élevé et ne sait pas si c'est grave → réponse possible :
    expliquer que `scoreRisque()` est une règle déterministe
    (seuils/comptages), pas une alerte de sécurité active — même
    discipline "zéro LLM, zéro alarme fabriquée" que Santé du compte
    (Domaine 4).
- **Questions utilisateur potentielles** : "Que veut dire le score de
  risque affiché ?" (formule réelle existe, jamais vulgarisée à
  l'écran — même famille que la formule de réputation, Domaine 4).
- **Aide existante** : **PARTIEL** — écran déjà professionnel et
  lisible, mais la logique de scoring reste invisible pour l'utilisateur.
- **Aide manquante** : vulgarisation de `scoreRisque()` — candidate
  connaissance transverse partagée avec `lib/reputationScore.ts`
  (Domaine 4) : **2 formules de score différentes dans le produit
  (risque journal, réputation avis), aucune des deux expliquée en
  langage produit** → nouvelle confusion candidate, voir **T11** ci-dessous.
- **Dépendances** : Domaine 4 module 5 (même famille de besoin —
  vulgariser un score interne).
- **Source technique** : `JournalTab.tsx`, `lib/journalTaxonomie.ts`.

##### 3. Collaboration (`collaboration` → `CollaborationTab.tsx`, 1028 lignes)

- **Code réel** : ↔ `api/institution/collaboration/**` (tables
  `collab_*`). Lecture ciblée (intro + types), reste du fichier
  **À VÉRIFIER** pour le détail fin des erreurs.
- **Rôle(s)** : ouvert aux 5 rôles (`collaboration.send`/
  `.create_group`/`.manage_group`/`.edit_message`/`.delete_message`/
  `.upload_file` — déjà vus en 1.2, tous accordés aux 5 rôles).
- **Comportement réel** : DM + groupes, **périmètre restant hors de ce
  lot explicitement documenté dans le code** (honnêteté déjà pratiquée) :
  pas de fils de réponse ni @mentions, pas de réactions/édition de
  fichiers, **pas de recherche plein texte**, **pas de vraie présence
  en ligne** ("Dernière connexion" réelle affichée à la place — aucune
  donnée de présence live n'existe côté serveur, encore une application
  du principe zéro-donnée-inventée). Rafraîchissement par **polling
  10s**, pas de canal Realtime pour ces lots.
- **Confusions transversales** : rappel explicite dans le code
  lui-même que Collaboration (interne membre↔membre) ne doit **jamais**
  être confondue avec Messagerie (citoyen↔institution, Domaine 4),
  Annonces, Communication ou Support Yelen — 4 écrans cités
  explicitement comme à ne pas mélanger. Cohérent avec T9 (Domaine 4)
  mais sur un axe différent (interne vs externe plutôt que
  public/privé) — **pas une nouvelle entrée**, juste une confirmation
  que la distinction interne/externe est déjà bien gardée côté code.
- **Moments d'aide identifiés (M)** :
  - Écran → membre cherche un indicateur "en ligne" classique → absent,
    seulement "Dernière connexion" → réponse possible : dire
    honnêtement qu'aucune présence live n'existe, comme le fait déjà
    le commentaire de code (à vérifier si l'écran lui-même le dit aussi
    clairement — **À VÉRIFIER**).
- **Questions utilisateur potentielles** : "Pourquoi je ne peux pas
  rechercher dans mes anciens messages ?" (non construit) / "Pourquoi
  ce statut ne se met pas à jour en temps réel ?" (polling 10s, pas
  Realtime — délai normal, jamais expliqué à l'écran).
- **Aide existante** : **À VÉRIFIER** — honnêteté forte dans le code,
  pas confirmé que ces limitations sont dites à l'écran lui-même plutôt
  que seulement en commentaire.
- **Aide manquante** : si les limitations ne sont pas déjà visibles à
  l'écran, un moment d'aide simple (ex. tooltip sur l'indicateur de
  présence) suffirait probablement — pas un article.
- **Dépendances** : Domaine 4 (distinction avec Messagerie/Annonces/
  Communication/Support, T9 voisine).
- **Source technique** : `CollaborationTab.tsx`.

##### 4. Clock In Shift (`clock-in-shift` → `ClockInShiftTab.tsx`, 2698 lignes)

- **Code réel** : déjà très largement documenté CLAUDE.md
  `/modules-livres` (module Enterprise de pointage, 4 sous-vues
  Présences/Employés/Départements/Horaires, refonte "Enterprise"
  05/08/2026, 2 bugs réels trouvés et corrigés, reste à faire :
  self-service changement de PIN employé au premier accès, écran
  historique employé). Ce passage confirme dans le code lu : **7
  statuts employé réels** (`actif`/`suspendu`/`en_conge`/`archive`/
  `desactive`/`teletravail`/`mission` — "Inactif" à l'affichage
  regroupe `archive`+`desactive`, UI simplifiée sans mentir sur la
  donnée réelle), 3 rôles employé (`admin`/`manager`/`employe`),
  horaires (`WorkSchedule`, 4 types fixe/fractionné/nuit/variable,
  tolérances configurables retard/départ anticipé/pause obligatoire).
- **Rôle(s)** : `admin` (`clock_in.write`) ; `superviseur`/`dirigeant`
  (`clock_in.read_full`) — déjà vus en 1.2.
- **Gaps confirmés (pas nouveaux, déjà dans CLAUDE.md)** : PIN jamais
  affiché nulle part (non négociable) ; `doitChangerPin` renvoyé par
  l'API mais **jamais consommé côté portail employé** (self-service
  changement de PIN au premier accès non construit).
- **Confusions transversales** : rappel T10 (aucun QR trouvé dans ce
  fichier précisément — le pointage Clock In Shift n'utilise pas de
  QR, contrairement à ce qu'on pourrait supposer par analogie avec le
  badge QR d'Équipe, module 1 de ce domaine — **distinction utile à
  documenter** : deux mécanismes d'accueil/présence différents,
  aucun des deux n'utilise l'autre).
- **Moments d'aide identifiés (M)** :
  - Écran → admin cherche à faire changer son PIN à un employé après
    création → aucune fonctionnalité self-service, doit repasser par
    l'admin → réponse possible : dire explicitement cette limite
    plutôt que de laisser chercher une option absente.
  - Portail employé → 7 statuts réels vs 5 affichés (regroupement
    archive/désactivé) → si un manager s'attend à voir "archivé"
    précisément quelque part → à vérifier si le filtre détaillé existe
    ailleurs dans l'écran (portion non relue ce passage — **À VÉRIFIER**).
- **Questions utilisateur potentielles** : déjà couvertes en grande
  partie par CLAUDE.md (rien de nouveau trouvé ce passage au-delà des 7
  statuts confirmés).
- **Aide existante** : **PARTIEL** (cohérent avec l'évaluation
  CLAUDE.md — refonte Enterprise soignée, quelques trous fonctionnels
  assumés).
- **Aide manquante** : rien de nouveau ce passage.
- **Dépendances** : Domaine 5 module 1 (Équipe, distinction de
  population déjà bien gardée dans le code des deux fichiers).
- **Source technique** : `ClockInShiftTab.tsx`,
  `app/api/institution/clock-in/*`.

##### 5. Espace de travail (`espace-travail` → `EspaceTravailTab.tsx` + 13 fichiers, 5688 lignes)

- **Code réel** : sous-produit interne à part entière — 5 sections
  (Agenda/Tâches/Documents/Projets/Notes), chacune avec son propre
  fichier `*Section.tsx` + `*Overlays.tsx`. Refonte "V3" du 20/09/2026
  (la plus récente de tout le produit à la date de cet audit), **audit
  complet mené par l'équipe produit elle-même en amont** — rare
  occurrence où le code documente explicitement avoir déjà suivi une
  démarche d'audit similaire à celle-ci.
- **Rôle(s)** : accessible via `espace_travail.write_projet`
  (Domaine 1, ActionKey déjà vue) ; onglet `full` pour tous les rôles
  sauf `comptable` (`none`) — cohérent avec 1.2.
- **Comportement réel, discipline zéro-donnée-inventée répétée 5 fois
  dans un seul module** (la preuve la plus dense trouvée dans tout
  l'audit à ce stade) :
  - **Agenda** : fusionne RDV (lecture seule) + événements internes
    (CRUD), conflit horaire vérifié juste avant enregistrement.
  - **Tâches** : 3 statuts réels (à faire/en cours/terminée), 3
    priorités réelles (basse/normale/haute) — **"pas les 5/4 de la
    maquette de référence"**, précision explicite du code refusant de
    construire au-delà du modèle réel.
  - **Documents** : **pas de versioning/partage/déplacement/corbeille**
    — "omis plutôt que simulés" ; suppression "honnête" car aucune
    promesse de restauration n'est faite puisqu'aucune corbeille
    n'existe.
  - **Projets** : **pas de dépendances entre tâches/projets** — "non
    inventées, non construites", bien que la donnée (`projet_id`
    partagé) pose une base pour un futur chantier.
  - **Notes** : **pas de partage par niveau, pas de favoris, pas de
    commentaires, pas de collaboration temps réel, pas d'historique de
    versions** — le brief produit "demande explicitement de ne rien
    simuler."
  - **Constat transversal** : **PC-first, "sans aucune logique mobile"**
    — retour Bryan explicite, contrairement au reste du dashboard qui
    est mobile-first avec adaptation desktop. **Seule inversion de
    convention repérée dans tout l'audit.**
- **Parcours réel** : discipline d'interaction cohérente sur 4 des 5
  sections — détails avant édition (jamais un clic direct vers la
  modification), confirmation dédiée à la suppression, garde
  "modifications non enregistrées" avant fermeture (voir **P13/P14**,
  registre patterns mis à jour).
- **Gaps** : aucun gap au sens "manque non assumé" — tout ce qui manque
  ici est **documenté comme un choix**, pas une lacune accidentelle.
- **Confusions transversales** : aucune nouvelle — ce module est plutôt
  une **preuve** que la discipline zéro-donnée-inventée (déjà notée
  Domaine 3/4) est un principe produit réel et généralisé, pas un cas
  isolé.
- **Moments d'aide identifiés (M)** :
  - Écran → prestataire ouvre l'Espace de travail sur mobile →
    expérience dégradée (PC-first assumé) → réponse possible : le dire
    explicitement plutôt que de laisser découvrir une UI non adaptée —
    **seul vrai candidat "problème UX" de ce module** (voir décision à
    prendre : corriger l'UX responsive un jour, ou documenter la
    limite en attendant — les deux options restent ouvertes, non
    tranchées ici).
  - Écran Documents → prestataire supprime un document en pensant
    pouvoir le récupérer → confirmation déjà honnête sur l'absence de
    corbeille (à vérifier le wording exact affiché — **À VÉRIFIER**).
- **Questions utilisateur potentielles** : "Pourquoi je ne peux pas
  définir une dépendance entre deux tâches ?" / "Puis-je partager une
  note avec un seul collègue ?" (non — lecture ouverte à toute
  l'équipe, écriture auteur/admin, pas de granularité plus fine) /
  "Pourquoi cet écran ne fonctionne pas bien sur mon téléphone ?"
- **Aide existante** : **PARTIEL/BON** — chaque section explique déjà
  implicitement ses limites via ses propres formulaires (pas de champ
  = pas de fonctionnalité), mais aucune explication explicite du
  choix "PC-first" quelque part dans l'UI elle-même — **À VÉRIFIER**.
- **Aide manquante** : signalement clair du caractère PC-first (si pas
  déjà présent) ; vulgarisation ponctuelle des absences volontaires
  (versioning, dépendances, présence live) si elles reviennent en
  questions réelles plus tard.
- **Dépendances** : Domaine 2 (`rdv`, lecture seule dans l'Agenda).
- **Source technique** : `EspaceTravailTab.tsx` + 13 fichiers sous
  `app/[slug]/[id]/espace-travail/components/` (lecture ciblée,
  intros uniquement — pas une lecture exhaustive des 5688 lignes).

---

#### Synthèse rapide — Domaine 5

**Aide existante par module** : PARTIEL/BON (3 — Équipe, Clock In
Shift, Espace de travail) · PARTIEL (1 — Journal) · À VÉRIFIER (1 —
Collaboration, honnêteté du code non confirmée visible à l'écran).

**Domaine le plus riche en preuves du principe zéro-donnée-inventée** :
Espace de travail à lui seul contient 5 applications distinctes de ce
principe (une par section) — ce n'est plus une observation ponctuelle
mais une discipline produit confirmée sur 5 domaines consécutifs
maintenant (Partenariat, Annonces, Avis, et 5× dans ce seul domaine).

**1 problème UX candidat, pas encore dans le registre** (volontairement
laissé hors de UX1-UX4 car de nature différente — pas un manque de
lien mais une asymétrie d'expérience assumée) : Espace de travail
PC-first alors que le reste du dashboard est mobile-first. Noté comme
"moment d'aide" plutôt que comme entrée UX formelle tant qu'il n'est
pas confirmé comme un vrai point de friction rencontré.

**Nouvelle connaissance transverse T11** (registre mis à jour) : deux
formules de score internes au produit (score de risque du Journal,
score de réputation des Avis) coexistent sans qu'aucune des deux ne
soit vulgarisée en langage produit à l'écran.

**Ferme un point ouvert du Domaine 1** : le mécanisme de verrouillage
de compte membre (`locked_until`) est confirmé réel, alimenté par
`failed_attempts` (migration `20260805000016`) — **reste ouvert** :
le seuil exact de tentatives avant verrouillage (logique de la route
de login, non lue ce passage).

**À vérifier avant tout contenu** (s'ajoute aux points ouverts des
Domaines 1-4, aucun refermé sauf la précision ci-dessus) :
- Seuil exact de tentatives avant verrouillage d'un compte membre.
- Détail complet des erreurs de Collaboration (fichier lu partiellement).
- Si les limitations de Collaboration (pas de recherche, pas de
  présence live) sont dites à l'écran ou seulement en commentaire de code.
- Wording exact de la confirmation de suppression sans corbeille
  (Espace de travail, Documents).
- Si le caractère "PC-first" de l'Espace de travail est signalé
  quelque part à l'écran pour un utilisateur mobile.

---

#### Domaine 6 — Sécurité & conformité (1 module)

Périmètre : `signalements` uniquement (`SignalementsTab.tsx`, 1248
lignes) — le plus petit domaine du découpage 2.1 en nombre d'écrans,
mais l'un des plus denses fonctionnellement (déjà documenté CLAUDE.md
`/modules-livres` comme refonte case management niveau NIST SP
800-61/OWASP).

##### 1. Signalements (`signalements` → `SignalementsTab.tsx`)

- **Code réel** : ↔ `api/institution/signalements/**`. Source unique
  du lifecycle : `lib/signalementsConstants.ts` — **partagée entre 4
  consommateurs** (cet écran, l'écran citoyen `app/signalement/page.tsx`,
  2 écrans admin), "ne jamais dupliquer ces listes ailleurs" (commentaire
  explicite du code).
- **Rôle(s)** : `admin`/`superviseur` (`signalements.write`/`.manage`) ;
  `agent`/`dirigeant` lecture (`read`, avec nuance sur les notes
  internes — voir plus bas) ; `comptable` `none`.
- **Comportement réel** : **8 statuts réels** (`nouveau`/`a_traiter`/
  `en_cours`/`en_attente`/`resolu`/`cloture`/`rejete`/`doublon`),
  **graphe de transition légal appliqué en code** (`SIGNALEMENT_TRANSITIONS`),
  jamais en trigger DB — même architecture que Documents clients
  (7 statuts, Domaine 2) et Support Yelen (4 statuts, Phase 1/Domaine
  4) : **3e module du produit avec une machine à états stricte de ce
  type, aucun des trois jamais expliqué en langage produit** — nouvelle
  connaissance transverse, voir **T12** ci-dessous. 4 priorités, 6
  actions de résolution, 3 niveaux d'escalade (agent/superviseur/admin),
  11 types d'événements d'audit.
- **Comportement réel — bidirectionnel** (chantier "arbitrage Yelen",
  15/08/2026) : la boîte de réception contient **2 sens distincts sur
  le même écran** — signalements **déposés par l'institution** contre
  un citoyen (`type_signaleur: "institution"`) et signalements **reçus
  contre l'institution** de la part d'un citoyen
  (`type_signaleur: "citoyen"`). Badge clair à 3 endroits de l'écran
  ("Déposé par vous" neutre vs "Contre vous"/"Déposé contre vous" en
  orange) — **avant ce chantier, l'institution n'avait qu'une simple
  notification pour le second cas**, changement de comportement réel à
  garder en tête si une question ancienne semble contredire le
  fonctionnement actuel.
- **Parcours réel** : création en **4 étapes** (identification du
  citoyen → situation/motif → vérification → succès avec numéro public)
  — **le citoyen signalé doit avoir un RDV réel et éligible avec
  l'institution** (`rdvsEligibles`, chantier "RDV obligatoire"
  15/08/2026) : un signalement ne peut pas viser n'importe quel
  citoyen de la plateforme, seulement quelqu'un avec qui une relation
  réelle existe déjà — garde-fou anti-abus.
- **États** : notes internes → `null` si `signalements.notes_read`
  absent pour le rôle courant, **distingué explicitement d'une liste
  vide** (le type le permet, `SignalementNoteRow[] | null`) — évite
  qu'un agent lise "aucune note" alors que la vraie raison est qu'il
  n'a pas le droit de les voir.
- **Erreurs** : `"Erreur lors de l'envoi. Réessayez."` / `"Une erreur
  est survenue."` (création) — génériques, moins spécifiques que
  d'autres écrans déjà vus (ex. Domaine 2, Centre de validation).
- **Gaps** : aucun nouveau — les 2 bugs réels déjà documentés
  CLAUDE.md (`/modules-livres`, sélecteur citoyen bloqué par RLS,
  colonne `titre` legacy bloquante) sont **fermés**, pas revérifiés en
  détail ce passage (confiance faite à la documentation existante,
  cohérente avec le code lu).
- **Confusions transversales** : **T12** (machine à états jamais
  expliquée, 3e occurrence) ; rappel T9 (Domaine 4, canaux citoyen↔
  institution) — les signalements bidirectionnels sont un **4e canal**
  à ajouter mentalement à cette liste, avec des règles encore
  différentes (ni public comme Questions clients/Avis, ni privé comme
  Messagerie, mais **formel et tracé**) — **T9 enrichie**, pas une
  nouvelle entrée (cohérent avec la consigne : une connaissance qui
  réapparaît ailleurs enrichit l'entrée existante).
- **Moments d'aide identifiés (M)** :
  - Écran → institution reçoit un signalement "Contre vous" pour la
    première fois → badge déjà clair, mais aucune explication du
    processus qui suit (délais, ce qui est attendu d'elle) →
    réponse possible : rappeler la procédure déjà connue par ailleurs
    du produit (notification sous 48h → collecte de sa version →
    décision Yelen, mentionnée dans l'ancien guide retiré — **À
    VÉRIFIER** si ces délais sont toujours réels avant de les
    réutiliser, ne pas reprendre un chiffre non revérifié).
  - Écran → agent avec accès lecture seule ne voit aucune note interne
    → distinction "pas de note" vs "pas le droit de voir" déjà faite
    dans la donnée, **à vérifier si l'écran l'explique visuellement**
    plutôt que d'afficher silencieusement une section vide dans les
    deux cas (**À VÉRIFIER**, non confirmé dans la portion lue).
- **Questions utilisateur potentielles** : "Pourquoi je ne peux pas
  signaler ce citoyen ?" (pas de RDV éligible — garde-fou anti-abus,
  jamais expliqué explicitement si le blocage survient) / "Que signifie
  ce statut ?" (T12) / "Combien de temps avant une décision sur un
  signalement reçu ?" (À VÉRIFIER, ne pas réutiliser le délai de
  l'ancien guide sans confirmation).
- **Aide existante** : **PARTIEL/BON** — badges de sens (par vous/contre
  vous) déjà très clairs, distinction technique notes null/vide bien
  pensée côté données.
- **Aide manquante** : vulgarisation du graphe de statuts (T12,
  transverse) ; explication du garde-fou "RDV éligible requis" au
  moment où il bloque, si ce n'est pas déjà fait (À VÉRIFIER) ; délai
  réel de traitement si mesurable un jour (ne rien inventer en
  attendant).
- **Dépendances** : Domaine 2 module 1 (`rdv`, éligibilité requise pour
  créer un signalement) ; Domaine 2 module 8 (Documents clients, même
  architecture de machine à états, T12) ; Domaine 4 (Support Yelen,
  même architecture, T9/T12) ; Domaine 1 (RBAC, notes internes gatées
  par `signalements.notes_read`).
- **Source technique** : `SignalementsTab.tsx`,
  `lib/signalementsConstants.ts`, `lib/signalements.ts` (serveur, non
  relu ce passage).

---

#### Synthèse rapide — Domaine 6

**Aide existante** : PARTIEL/BON — domaine le plus petit en surface
mais déjà bien traité sur ses points les plus visibles (badges de sens,
distinction notes null/vide), moins traité sur le fond (statuts,
délais).

**Domaine 6 confirme une architecture produit répétée 3 fois
maintenant** : machine à états avec transitions légales en code (jamais
trigger DB) sur Signalements (8 statuts), Documents clients (7,
Domaine 2) et Support Yelen (4, Domaine 4/Phase 1) — nouvelle
connaissance transverse **T12**, qui ne crée pas 3 articles séparés
mais capture un seul besoin répété : expliquer "que signifie ce
statut, qu'est-ce qui peut se passer ensuite" pour n'importe lequel de
ces 3 systèmes.

**T9 enrichie, pas dupliquée** (conforme à la consigne) : les
signalements bidirectionnels ajoutent un 4e canal citoyen↔institution
à la connaissance déjà ouverte au Domaine 4 (Questions clients/
Messagerie/Avis) — même famille de besoin ("quels canaux existent, et
quelles règles de visibilité/formalité pour chacun"), pas une nouvelle
connaissance isolée.

**T10/T11 revérifiés ce domaine** : aucune trace de système QR ni de
score supplémentaire dans Signalements — les deux connaissances restent
à leur portée actuelle (T10 : Domaines 2 et 5 ; T11 : Domaines 4 et 5),
non enrichies ce passage.

**Aucun nouveau problème UX (UX)** ni pattern (P) suffisamment distinct
identifié ce domaine — les badges "par vous/contre vous" sont une bonne
pratique mais relèvent de la même famille que P6 (motif de refus/
information affichée en évidence dès qu'elle existe), pas une
catégorie nouvelle.

**À vérifier avant tout contenu** (s'ajoute aux points ouverts des
Domaines 1-5, aucun refermé) :
- Délai réel de traitement d'un signalement reçu (ne pas réutiliser le
  chiffre de l'ancien guide retiré sans confirmation).
- Si l'écran explique visuellement la différence entre "aucune note"
  et "pas le droit de voir les notes" pour un rôle en lecture seule.
- Si le garde-fou "RDV éligible requis" pour créer un signalement est
  expliqué au moment où il bloque la création.
- Détail exact des 2 bugs déjà documentés CLAUDE.md (confiance faite à
  la documentation existante, non revérifiée ligne à ligne ce passage).

---

#### Domaine 7 — Finance (7 modules)

Périmètre : `paiements`, `transactions`, `historique-financier`,
`facturation`, `rapports`, `documents-financiers`, `analyse`. Argent
des **clients de l'institution** — à ne jamais confondre avec "Yelen
Business" (Domaine 8, argent entre l'institution et Yelen elle-même,
non encore audité). `FinanceAccueilTab.tsx` (130 lignes) mentionné en
note : ce n'est pas un `TabKey` séparé, c'est la version de l'onglet
"Accueil" que voit spécifiquement le rôle `comptable` (décision CEO
22/07/2026) — inclus ici plutôt que dans le Domaine 1 car 100%
financier.

##### 1. Paiements (`paiements` → `PaiementsTab.tsx`, 571 lignes)

- **Code réel** : ↔ `api/institution/paiements`. Domaine principal du
  `comptable` (`paiements.rembourser`).
- **Rôle(s)** : `admin`/`comptable` — mais avec une **protection de
  domaine explicite** : l'admin reste en lecture seule tant qu'un
  comptable actif existe (`lib/comptableProtection.ts`,
  `accesUrgenceAdminDebloque`, déjà référencé CLAUDE.md).
- **Comportement réel — le meilleur exemple de blocage expliqué avec
  workaround concret trouvé dans tout l'audit** : quand l'admin ne peut
  pas rembourser, l'écran affiche littéralement *"Les remboursements
  sont réservés au comptable... Pour intervenir vous-même en cas
  d'urgence, suspendez d'abord son compte (onglet Équipe) : cette étape
  rend votre intervention visible et tracée, pour protéger son
  travail."* — explique la règle, la raison, **et** la marche à suivre
  exacte, en une seule fois. Une fois le comptable suspendu, bandeau
  différent : *"Mode intervention d'urgence actif..."*.
- **Parcours réel** : 6 onglets de filtre, dont **"Litiges" structurellement
  présent mais toujours vide** — aucun concept de litige n'existe en
  base (les signalements, Domaine 6, sont génériques citoyen↔institution,
  pas rattachés à un paiement précis), décision CEO documentée : *"montre
  que Yelen est prêt"*. Différent des autres cas de zéro-donnée-inventée
  déjà vus : ici, la structure est posée en avance **sans jamais
  simuler de contenu dedans** — nuance à garder si la question revient
  ("pourquoi cet onglet est-il vide ?").
- **États** : badge de reçu à **3 états réels** (Reçu généré / Reçu en
  attente / Reçu archivé) plutôt qu'un binaire présent/absent — l'état
  "en attente" qui persiste est justement le signal d'anomalie utilisé
  ailleurs sur l'écran.
- **Erreurs** : `"Erreur lors du remboursement"`. Motif de remboursement
  **facultatif** (placeholder "facultatif" explicite), contrairement au
  motif obligatoire ≥5 caractères du Centre de validation (Domaine 2) —
  **incohérence de rigueur entre deux actions similaires** (annuler un
  paiement/RDV), à vérifier si volontaire.
- **Gaps** : aucun nouveau au-delà de "Litiges" (assumé, pas un manque).
- **Confusions transversales** : aucune nouvelle propre à ce module.
- **Moments d'aide identifiés (M)** :
  - Écran → admin clique une action de remboursement et découvre qu'il
    n'y est pas autorisé → déjà l'un des meilleurs messages de blocage
    de tout l'audit → **pattern de référence, voir P15**.
  - Écran → prestataire cherche à traiter un litige client → onglet
    présent mais vide → réponse possible : dire explicitement que ce
    n'est pas encore un vrai mécanisme plutôt que de laisser deviner.
- **Questions utilisateur potentielles** : "Pourquoi je ne peux pas
  rembourser ce paiement ?" (déjà très bien répondu) / "Comment
  fonctionne l'onglet Litiges ?" (rien à répondre aujourd'hui, honnêtement).
- **Aide existante** : **EXISTE, remarquable** — meilleur exemple de
  blocage expliqué avec workaround concret de tout l'audit.
- **Aide manquante** : rien de critique ; l'onglet Litiges mériterait
  une mention honnête ("bientôt") plutôt qu'un silence total si ce
  n'est pas déjà le cas (**À VÉRIFIER**, état vide de cet onglet précis
  non lu).
- **Dépendances** : Domaine 5 (suspension d'un membre via Équipe, partie
  du workaround) ; Domaine 6 (signalements, absence de lien avec les litiges).
- **Source technique** : `PaiementsTab.tsx`, `lib/comptableProtection.ts`.

##### 2. Transactions (`transactions` → `TransactionsTab.tsx`, 454 lignes)

- **Code réel** : ↔ `lib/transactionsFinancieres.ts`. **Grand livre
  strictement en lecture seule pour tous, y compris l'admin en mode
  urgence** — "on ne modifie jamais l'historique, seulement l'état
  courant via Paiements/Facturation", même discipline d'immuabilité que
  `journal_activite`/`document_events`/`signalement_events` déjà notée
  CLAUDE.md (`/pieges-techniques-connus`) — **mais ici sans trigger
  DB d'immuabilité mentionné, juste une discipline applicative** (À
  VÉRIFIER si un trigger existe réellement ou si c'est une convention
  non forcée en base).
- **Rôle(s)** : `admin`/`comptable` (`yelen_transactions.voir` — nom de
  clé partagé avec Yelen Business, **À VÉRIFIER au Domaine 8** si les
  deux "Transactions" utilisent vraiment la même `ActionKey` ou si
  c'est une coïncidence de nommage).
- **Comportement réel** : 5 types de transaction
  (encaissement/remboursement/correction/annulation/ajustement), chacun
  avec sa propre couleur. Export multi-format (CSV/XLSX/PDF) — 3 formats
  réels, à comparer avec les autres écrans d'export du produit
  (Journal d'activité, Domaine 5, en propose 5).
- **Dépendances** : module 1 (source des transactions d'encaissement/
  remboursement).
- **Source technique** : `TransactionsTab.tsx`, `lib/transactionsFinancieres.ts`.

##### 3. Historique financier (`historique-financier` → `HistoriqueFinancierTab.tsx`, 129 lignes)

- **Comportement réel** : **même donnée que Paiements, aucune action** —
  la distinction de rôle entre les deux écrans est **explicitée dans le
  code lui-même** ("Paiements = travailler dessus, Historique =
  consulter/exporter"). Bon candidat à reprendre tel quel si la
  confusion Paiements/Historique revient côté prestataire — **À
  VÉRIFIER si c'est déjà dit à l'écran** ou seulement en commentaire
  (même schéma de vigilance que pour d'autres écrans de ce type déjà
  notés).
- **Aide existante** : **PARTIEL** — la distinction est déjà claire
  dans l'intention du code, pas confirmé si elle l'est à l'écran.
- **Source technique** : `HistoriqueFinancierTab.tsx`.

##### 4. Facturation clients (`facturation` → `FacturationTab.tsx`, 595 lignes)

- **Code réel** : ↔ `lib/facturationClients.ts`, refonte "V3"
  (18/09/2026). **Nom délibérément choisi pour ne jamais être confondu
  avec "Facturation Yelen"** (Yelen Business, Domaine 8, relation
  Yelen→institution plutôt qu'institution→client) — commentaire
  explicite du code : *"Aucun rapport avec Facturation Yelen... nom
  délibérément différent pour ne jamais les confondre"*. **Bon exemple
  de nommage préventif** — à vérifier au Domaine 8 si ça suffit
  réellement une fois les deux écrans vus côte à côte par un même
  prestataire (nouvelle entrée patterns, voir **P16**).
- **Rôle(s)** : `admin`/`comptable` (`facturation.write`).
- **Comportement réel** : 6 statuts de facture réels
  (`brouillon`/`envoyee`/`partiellement_payee`/`payee`/`annulee`/
  `remboursee`) + `en_retard` comme filtre dérivé (même famille que
  `en_retard`/`terminee` déjà vus, Domaines 2 et 4) — **À VÉRIFIER**
  si une machine à états légale au sens de T12 encadre ces transitions
  (pas confirmé dans la portion lue, pas d'export `*_TRANSITIONS`
  repéré comme pour Signalements/Documents clients/Support).
- **Décision UX notable** : un bandeau permanent "Domaine protégé du
  comptable" a été **retiré** le 18/09/2026 — retour Bryan explicite :
  la vraie protection reste serveur, seul le bouton d'action concerné
  est gaté côté UI, **"jamais un texte permanent juste pour consulter"**.
  Cohérent avec le principe "aide au moment du blocage, pas en
  permanence" déjà observé ailleurs (Paiements, module 1) — confirme
  que l'équipe produit a explicitement arbitré contre les bandeaux
  d'avertissement permanents.
- **Gaps** : reçu HTML imprimable (pas de PDF serveur, décision assumée
  22/07/2026) ; création manuelle de client bloquée explicitement par
  CLAUDE.md `/backlog-produit` (décision Bryan, pas un oubli).
- **Confusions transversales** : nouvelle candidate P16 (nommage
  préventif Facturation clients/Yelen) — à confirmer/enrichir au
  Domaine 8, pas encore une entrée T tant que le second écran n'est pas
  vu.
- **Moments d'aide identifiés (M)** :
  - Écran → prestataire cherche pourquoi il ne peut pas créer une
    facture → plus de bandeau permanent depuis le 18/09 → le blocage
    n'apparaît qu'au clic sur le bouton concerné → à vérifier que le
    message à ce moment précis est aussi clair que celui de Paiements
    (**À VÉRIFIER**, non lu).
- **Aide existante** : **PARTIEL/BON** — nommage préventif réfléchi,
  décision UX documentée et assumée sur les bandeaux permanents.
- **Aide manquante** : confirmer le message exact au clic bloqué (À VÉRIFIER).
- **Dépendances** : Domaine 8 (Yelen Business, Facturation Yelen — P16).
- **Source technique** : `FacturationTab.tsx`, `lib/facturationClients.ts`.

##### 5. Rapports (`rapports` → `RapportsTab.tsx`, 471 lignes)

- **Code réel** : ↔ `api/institution/rapports/executif`
  (`lib/rapportsAggregation.ts`) — **route distincte** de
  `api/institution/finance/accueil` (FinanceAccueilTab) : deux sources
  de données différentes pour des besoins différents (rapport formel
  exportable vs tableau de bord quotidien), jamais fusionnées, précisé
  explicitement dans le code.
- **Comportement réel** : export PDF/Excel/impression ; graphiques
  (courbe, donut, sparklines) en **SVG manuel**, aucune librairie de
  charts — convention confirmée du projet, partagée avec le module 7
  (Analyse) et le Journal d'activité (Domaine 5).
- **Confusions transversales** : rappel T11 (formules de score internes)
  — "resume" (phrases déterministes) apparaît encore ici, cohérent avec
  Journal (Domaine 5) et Santé du compte (Domaine 4) : **3e écran** avec
  un résumé en langage déterministe zéro-LLM, pattern maintenant très
  établi (pas une nouvelle connaissance, juste une occurrence de plus
  du principe `/stack-specifique`, pas de T dédiée nécessaire).
- **Dépendances** : module 6 (Historique financier/FinanceAccueilTab,
  distinction de source de données) ; module 7 (Analyse, même
  convention SVG).
- **Source technique** : `RapportsTab.tsx`, `lib/rapportsAggregation.ts`.

##### 6. Documents financiers (`documents-financiers` → `DocumentsFinanciersTab.tsx`, 427 lignes)

- **Code réel** : ↔ même table que Espace de travail/Documents
  (`documents_travail`, filtrée aux 5 catégories financières), même
  bucket Storage privé "documents-travail".
- **Comportement réel — cas d'école du principe zéro-donnée-inventée
  appliqué à une refonte visuelle** : le brief d'origine maquettait des
  colonnes/KPI qui n'existent pas dans le modèle réel (Montant, Citoyen,
  Statut valide/en attente/annulé, "documents archivés"). Plutôt que de
  les inventer, **substitutions honnêtes documentées une par une dans
  le code** : "Montant" → Taille du fichier (réelle) ; "Citoyen" →
  "Ajouté par" (membre réel) ; "Statut" coloré → badge de catégorie
  réelle ; KPI "En attente" → "Cette semaine" (réel) ; KPI "Archivés" →
  "Catégories utilisées" (réel) ; "Référence" → code d'affichage
  dérivé de l'id réel, jamais stocké. **Le cas le plus systématique et
  le mieux documenté du principe dans tout l'audit** — chaque
  substitution a sa propre justification écrite.
- **Confusions transversales** : aucune nouvelle — confirme et enrichit
  la discipline zéro-donnée-inventée déjà notée 5 fois au Domaine 5
  (Espace de travail) et ailleurs.
- **Moments d'aide identifiés (M)** :
  - Écran → prestataire s'attend à un "Statut" de document (valide/en
    attente comme sur Documents clients, Domaine 2) → absent ici, remplacé
    par une catégorie → réponse possible : ce n'est pas le même type de
    document (bibliothèque de fichiers uploadés à la main, pas un
    workflow de validation) — **T12 ne s'applique pas ici**, à
    préciser si la confusion apparaît réellement (pas encore un
    problème confirmé, juste un risque identifié par la lecture du code).
- **Aide existante** : **BON** implicitement (rien de trompeur affiché)
  mais rien d'explicite non plus sur *pourquoi* ces champs sont différents
  de Documents clients.
- **Dépendances** : Domaine 5 module 5 (Espace de travail, même table
  et bucket) ; Domaine 2 module 8 (Documents clients, risque de
  confusion de modèle).
- **Source technique** : `DocumentsFinanciersTab.tsx`, `lib/documentsTravail.ts`.

##### 7. Centre d'Analyse (`analyse` → `CentreAnalyseTab.tsx`, 2009 lignes — lecture ciblée)

- **Code réel** : le plus gros fichier de ce domaine — lecture ciblée
  (intro + sous-navigation), pas exhaustive sur les 2009 lignes.
  7 sous-onglets : Vue d'ensemble, Acquisition, Tunnel, Heatmap,
  Géographie, Mes clients, Performances.
- **Comportement réel** : **"Performances" (répartition par appareil)
  est un stub honnête** — "aucune donnée device/user-agent n'est
  capturée sur les vues/clics/RDV nulle part dans le projet (audit
  confirmé)", donc rien n'y est affiché avant un futur chantier de
  tracking dédié. **Nouvelle occurrence confirmée du zéro-donnée-inventée**
  (pas une nouvelle T, juste une preuve de plus). Insights générés par
  règles déterministes (`genererInsightAnalyse`/`genererInsightClients`/
  `genererPointsAttention`), zéro LLM — encore une occurrence du même
  principe que Rapports/Journal/Santé du compte.
- **Gaps** : "Conseil personnalisé" (Lot 1) coexiste avec une future
  carte "Insight IA" prévue au Lot 6 du brief d'origine — **À VÉRIFIER**
  si ce Lot 6 a été construit depuis (le commentaire lu date d'avant,
  pas revérifié dans ce passage si le module a évolué).
- **Confusions transversales** : aucune nouvelle.
- **Dépendances** : module 5 (Rapports, même convention SVG manuel) ;
  Domaine 2 module 4 (Mes Clients, sous-onglet "Mes clients" ici — à
  vérifier s'il s'agit d'une vue différente ou d'une redite, **À
  VÉRIFIER**, non comparé dans ce passage).
- **Source technique** : `CentreAnalyseTab.tsx` (lecture ciblée),
  `lib/analyseAggregation.ts`, `lib/analyseClients.ts`,
  `lib/analyseAcquisition.ts`, `lib/analyseTunnel.ts`,
  `lib/analyseHeatmap.ts`.

---

#### Synthèse rapide — Domaine 7

**Aide existante** : EXISTE/remarquable (1 — Paiements, meilleur
exemple de blocage expliqué avec workaround de tout l'audit) ·
PARTIEL/BON (3 — Historique financier, Facturation, Documents
financiers) · non évalué en détail (2 — Transactions, Rapports, Analyse
— lecture plus légère, rien de trompeur repéré).

**2 nouveaux patterns UX majeurs** (registre P mis à jour) :
- **P15** — Blocage expliqué avec règle + raison + marche à suivre
  concrète en une seule fois (Paiements, protection du domaine
  comptable) — le plus complet de tout l'audit à ce stade.
- **P16** — Nommage délibérément distinct pour deux concepts proches
  partageant un même mot ("Facturation clients" vs "Facturation
  Yelen") — décision préventive documentée dans le code, à confirmer
  suffisante une fois le Domaine 8 vu.

**Documents financiers confirme le cas le plus systématique du
principe zéro-donnée-inventée** de tout l'audit : chaque substitution
honnête (Montant→Taille, Citoyen→Ajouté par, Statut→Catégorie...) est
individuellement justifiée dans le code, pas juste appliquée en bloc.

**T10/T11 revérifiés, aucune nouvelle occurrence** ce domaine. **T12
laissé explicitement "à vérifier"** pour Facturation (statuts réels
confirmés, mécanique de transition légale non confirmée) — pas
d'extrapolation depuis les 3 occurrences déjà connues.

**1 incohérence repérée entre deux écrans similaires** : motif de
remboursement facultatif sur Paiements vs motif obligatoire (≥5
caractères) sur le Centre de validation (Domaine 2) pour des actions
comparables (annuler/rembourser) — noté sans trancher si c'est
volontaire.

**À vérifier avant tout contenu** (s'ajoute aux points ouverts des
Domaines 1-6, aucun refermé) :
- Si l'onglet "Litiges" (Paiements) affiche un message honnête ou reste
  silencieusement vide.
- Si `transactions_financieres` a un vrai trigger DB d'immuabilité ou
  seulement une discipline applicative.
- Si `yelen_transactions.voir` (ActionKey) est vraiment partagée entre
  Transactions (ce domaine) et Yelen Business (Domaine 8), ou une
  coïncidence de nommage.
- Si une machine à états légale (T12) encadre réellement les statuts de
  Facturation clients.
- Message exact affiché au clic bloqué sur "+ Nouvelle facture" pour
  un admin sans comptable actif.
- Si le sous-onglet "Mes clients" du Centre d'Analyse fait doublon avec
  Mes Clients (Domaine 2) ou apporte une vue réellement différente.
- Si le Lot 6 ("Insight IA") du Centre d'Analyse a été construit depuis
  le commentaire lu (daté, non revérifié).

---

#### Domaine 8 — Yelen Business (10 modules) — DERNIER DOMAINE DE L'AUDIT

Périmètre : `yelen-compte`, `yelen-contrat`, `yelen-forfait`,
`yelen-paiements`, `yelen-transactions`, `yelen-reconciliation`,
`yelen-frais-commissions`, `yelen-facturation`, `yelen-documents`,
`yelen-support`. Relation **institution ↔ Yelen elle-même** (montant
que l'institution doit à Yelen, contrat, forfait) — à ne jamais
confondre avec le Domaine 7 (argent des clients de l'institution).
Chantier du 17-18/09/2026, le plus récent de tout le produit à la date
de cet audit.

##### Constat d'architecture unique à ce domaine — lu une fois, vrai pour les 9 écrans construits

**9 des 10 écrans partagent un seul et même patron honnête**, matérialisé
par 2 composants partagés (`YelenBusinessShared.tsx`, 77 lignes) :
`ChampBientot` (un champ dont la fonctionnalité **n'existe pas encore
côté produit** — jamais une valeur fabriquée à la place, reste visible
dans sa grille avec un badge "Bientôt disponible"/"Non défini") et
`SectionBientot` (même principe pour une section entière). Chaque
écran documente **individuellement dans son commentaire d'en-tête**
l'audit préalable qui justifie chaque champ réel vs chaque champ
"Bientôt disponible" — jamais une déduction, toujours une vérification
explicite ("aucune table 'contrat' n'existe en base", "zéro passerelle
de paiement intégrée", etc.). **C'est la démonstration la plus
aboutie et la plus systématique du principe zéro-donnée-inventée de
tout l'audit** — au niveau composant partagé, pas seulement au niveau
de décisions ponctuelles comme dans les domaines précédents.

Champs réellement disponibles aujourd'hui (les seuls à ne **jamais**
être des `ChampBientot`, communs à plusieurs écrans) :
`institutions.{name, secteur, statut, plan, created_at, id, logo,
badge_verifie}` — rien d'autre. Tout le reste (raison sociale, ID
organisation, type de compte, dates contractuelles, responsable
commercial, cycle de facturation, montants, documents) est un champ
"Bientôt disponible"/"Non défini" sur les 9 écrans.

##### Détail par écran (résumé — le patron ci-dessus s'applique à tous)

- **Compte Yelen** (`YelenCompteTab.tsx`, 188 lignes, 1er construit) :
  hero identité + 6 sections, dont 4 entièrement "Bientôt disponible"
  (Contrat/Facturation/Documents/partie Relation commerciale). Seul
  écran avec une vraie mini-timeline ("Compte Yelen activé" à la date
  réelle de création).
- **Contrat Yelen** (`YelenContratTab.tsx`, 152 lignes) : **aucun statut
  contractuel affiché** — retour Bryan explicite cité dans le code :
  ne jamais emprunter `institutions.statut`/`created_at` comme s'ils
  étaient des faits contractuels vérifiés, même si techniquement
  disponibles. Distinction fine et volontairement maintenue entre
  deux données qui *pourraient* se confondre facilement.
- **Facturation** (`YelenFacturationTab.tsx`, 185 lignes, 8e écran) :
  **la distinction la plus explicite de tout Yelen Business** —
  commentaire d'en-tête définit précisément la question à laquelle
  chacun des 4 écrans adjacents répond ("qu'est-ce que Yelen me
  facture et quand dois-je payer" vs Transactions "quel mouvement a eu
  lieu" vs Frais "combien ça coûte" vs Réconciliation "est-ce que ça
  correspond") — **confirme et enrichit fortement P16**, voir synthèse.
  KPI à "0 GNF"/"0 facture" (réellement zéro, pas masqués) ; ton neutre
  choisi délibérément à la place d'un badge vert de succès qui
  impliquerait une relation de facturation déjà vérifiée.
- **Réconciliation** (`YelenReconciliationTab.tsx`, 171 lignes, 6e
  écran) : même discipline — "rapprocher suppose DEUX sources de
  données réelles, aucune des deux n'existe" (zéro passerelle de
  paiement intégrée), ton neutre "rien à rapprocher pour l'instant"
  plutôt qu'un badge "à jour" fabriqué.
- **Documents Yelen** (`YelenDocumentsTab.tsx`, 111 lignes, 9e écran) :
  coffre agrégeant les documents des *autres* modules Yelen Business
  (pas un espace de stockage indépendant) — état vide avec **texte
  donné explicitement par Bryan** (§12 du brief, cité dans le code),
  jamais un texte générique de type "uploadez votre premier fichier"
  qui laisserait croire à un espace personnel.
- **Forfait, Paiements, Transactions, Frais & commissions** : mêmes
  fichiers de taille comparable (145-185 lignes), même patron confirmé
  par sondage (intro + `ChampBientot` systématique) — **non relus en
  détail ligne à ligne** dans ce passage, la redondance du patron déjà
  confirmée sur 5 écrans rendant une 9e lecture exhaustive peu
  informative. Honnêteté explicite : si l'un de ces 4 écrans contient
  une exception au patron, elle n'a pas été détectée ici (**À VÉRIFIER**).
- **Support Yelen** (`yelen-support`) : **présent dans la nav
  (section "Assistance", libellé "Support Yelen") et accessible selon
  TAB_MATRIX, mais aucun bloc `KeepMounted tabKey="yelen-support"` n'a
  été trouvé dans `layout.tsx`** — contrairement aux 9 autres écrans,
  celui-ci n'a **aucun contenu rendu du tout**, pas même un état vide
  honnête. Différent de tous les autres cas de "Bientôt disponible"
  déjà vus dans ce domaine : ici ce n'est pas un choix honnête assumé,
  c'est une **absence de rendu** — nouvelle entrée UX, voir **UX5**.
- **Décalage de documentation repéré** : le commentaire d'en-tête de la
  section Yelen Business dans `layout.tsx` (ligne ~5477) affirme encore
  que seul "Compte Yelen" est construit et que les 8 autres "restent à
  l'état vide" — **ce commentaire est obsolète**, contredit par la
  numérotation "6e écran"/"8e écran"/"9e écran" trouvée dans les
  fichiers eux-mêmes et par la lecture directe de leur contenu réel.
  Exemple concret cité par la consigne Bryan du Domaine 6 : une ancienne
  aide/formulation peut devenir obsolète sans que le code environnant
  soit mis à jour en conséquence — **ce commentaire en est un exemple
  direct dans le code source lui-même**, pas seulement une hypothèse
  pour un futur article.

##### Vérification spécifique demandée — P16 (Facturation clients vs Facturation Yelen)

**P16 confirmé et renforcé, pas infirmé.** Le Domaine 7 avait déjà
trouvé un commentaire explicite sur `FacturationTab.tsx` (clients)
expliquant le choix de nom pour ne jamais confondre avec "Facturation
Yelen". Ce domaine confirme la réciproque côté `YelenFacturationTab.tsx`
et va plus loin : **la même discipline de nommage/scope s'applique
aussi *entre* les 4 écrans financiers de Yelen Business eux-mêmes**
(Facturation/Transactions/Frais/Réconciliation), chacun scopé à une
question précise et non chevauchante, documentée explicitement. Ce
n'est donc pas une décision locale isolée à une seule paire d'écrans,
mais **une convention de conception répétée au moins 5 fois** dans la
même session de travail (17-18/09/2026) — suffisant pour la considérer
comme un pattern général du produit plutôt qu'un cas isolé. **P16 mis à
jour en conséquence** (voir registre).

##### Aide existante / manquante

- **Aide existante** : **EXISTE, exceptionnel** sur la transparence des
  limites (aucun champ ne ment sur son état), mais **ABSENT** sur toute
  explication du *pourquoi* — un prestataire qui ouvre ces 9 écrans
  voit une grille majoritairement grise sans qu'aucun texte ne dise
  explicitement "cette section de Yelen Business est en cours de
  construction, votre compte réel n'est pas affecté" au niveau le plus
  global (chaque écran l'explique localement, jamais une fois pour
  toute la section).
- **Moments d'aide identifiés (M)** :
  - Écran → prestataire ouvre "Yelen Business" pour la première fois,
    voit une grille de champs "Bientôt disponible" → réponse possible :
    un message d'orientation **au niveau de la section entière**
    (pas encore construit nulle part) plutôt que de laisser chaque
    écran se répéter individuellement.
  - Écran → prestataire clique "Support Yelen" dans le menu Yelen
    Business → écran vide sans explication (UX5) → réponse minimale :
    rediriger vers le vrai `support`/`SupportYelenTab` (Domaine 4)
    plutôt que de laisser un blanc.
- **Questions utilisateur potentielles** : "Pourquoi presque tout est
  vide dans Yelen Business ?" / "Où est passé le support depuis ce
  menu ?" (UX5).

##### Confusions transversales, T10/T11/T12

- **T10 (QR)** : aucune occurrence — pas de système QR dans Yelen
  Business. Portée inchangée (Domaines 2, 5).
- **T11 (scores)** : aucune occurrence. Portée inchangée (Domaines 4, 5).
- **T12 (machines à états)** : **non confirmable** — les statuts de
  facture/réconciliation affichés (Payées/À payer/En retard...,
  Suggestions/Écarts/Introuvables...) existent comme *filtres UI* et
  dans les types (`lib/yelenReconciliation.ts`), mais **aucune donnée
  réelle n'existe encore pour vérifier si une machine à états légale
  les encadre** comme pour Signalements/Documents clients/Support.
  Reste **À VÉRIFIER**, pas ajouté à T12 sans preuve d'une transition
  réellement appliquée sur une vraie ligne de données.

---

#### Synthèse rapide — Domaine 8 (et fin de l'audit technique 8/8)

**Aide existante** : EXISTE/exceptionnel sur la transparence locale
(9/10 écrans) · ABSENT sur l'orientation globale de la section ·
UX5 nouveau (1 écran sans aucun rendu).

**Domaine 8 est la confirmation la plus forte de tout l'audit** du
principe zéro-donnée-inventée : il ne s'agit plus d'une décision
ponctuelle par écran (Partenariat, Domaine 3 ; Annonces/Avis, Domaine 4 ;
Espace de travail ×5, Domaine 5 ; Documents financiers, Domaine 7) mais
d'un **système partagé** (`ChampBientot`/`SectionBientot`) construit
spécifiquement pour appliquer ce principe de façon uniforme sur 9
écrans d'affilée.

**P16 confirmé et élargi** : le nommage/scope délibérément distinct
pour des concepts financiers proches n'est pas une décision locale
(Facturation clients vs Yelen) mais une convention répétée sur 5
écrans de la même session — mis à jour dans le registre patterns.

**1 nouvelle entrée UX (UX5)** : `yelen-support` accessible depuis la
navigation mais sans aucun contenu rendu — différent des 9 autres
écrans du domaine qui ont tous, eux, un état vide honnête construit.

**1 décalage de documentation interne repéré** : le commentaire de
`layout.tsx` sur l'état de la section Yelen Business est obsolète par
rapport au code qu'il décrit — exemple concret, dans le code source
lui-même, du risque qu'une ancienne formulation devienne fausse sans
mise à jour — argument direct pour la consigne Bryan du Domaine 6 sur
l'historique des comportements.

**À vérifier avant tout contenu** (s'ajoute aux points ouverts des
Domaines 1-7, aucun refermé) :
- Détail non lu ligne à ligne de Forfait/Paiements/Transactions/Frais
  & commissions (patron confirmé par sondage, pas une lecture exhaustive).
- Si une machine à états légale (T12) encadrera réellement les statuts
  de Facturation Yelen/Réconciliation une fois des données réelles
  disponibles.
- Si la restriction `yelen_documents.voir_contrats` (comptable exclu
  des contrats, déjà documentée `lib/institutionPermissions.ts`) est
  réellement appliquée dans `YelenDocumentsTab.tsx` — non confirmé une
  restriction de catégorie visible dans le composant lu.
- Contenu réel qui devrait apparaître sous `yelen-support` (UX5) —
  fusion avec `SupportYelenTab` ou écran dédié jamais construit.

---

### Registre des patterns UX d'aide existants

Mécanismes du produit qui aident déjà bien un prestataire, à généraliser
plus tard plutôt qu'à remplacer par des liens vers un Help Center.
**Jamais réécrits en article.** Catégorie = la nature du pattern
(premier usage / réouvrable / empty state intelligent / redirection
contextuelle / blocage expliqué / valeur liée à une fonctionnalité réelle).

| # | Pattern | Où | Catégorie |
|---|---|---|---|
| P1 | Empty states différents selon le statut réel de l'institution (refusée/suspendue/en attente/validée), chacun avec un CTA pertinent | Domaine 2, `rdv` | Empty state intelligent |
| P2 | Redirection sectorielle complète (hôtel) plutôt qu'un écran inadapté laissé tel quel | Domaine 2, `disponibilites` ; Domaine 1, `configuration-hotel` | Redirection contextuelle |
| P3 | Icône/bandeau permanent "lecture seule" qui explique pourquoi une action est impossible | Domaine 2, `rdv-historique` | Blocage expliqué |
| P4 | Donnée affichée masquée tant que non chargée plutôt qu'un "0" trompeur | Domaine 2, `codeqr` (compteur) ; Domaine 3, Mes Offres (delta hebdo) | Valeur liée à une fonctionnalité réelle |
| P5 | Pop de valeur au premier accès à un écran, réouvrable à la demande via une icône dédiée | Domaine 3, `MesOffresIntro` | Premier usage + réouvrable |
| P6 | Motif de refus toujours affiché en évidence dès qu'il existe | Domaine 1 (Documents) ; Domaine 3 (Mes Offres, Partenariat) | Blocage expliqué |
| P7 | Message de restriction de rôle explicite et nommé plutôt que générique | Domaine 3, Partenariat (candidature) | Blocage expliqué |
| P8 | Champ "prochaine étape" qui change de texte selon le rôle ET le statut de l'utilisateur qui le lit | Domaine 4, Communauté Pro | Redirection contextuelle |
| P9 | État vide sous un seuil minimum de données, avec barre de progression et description de ce qui s'affichera une fois atteint | Domaine 4, Avis (Santé du compte) | Empty state intelligent |
| P10 | Bouton désactivé avec message explicite plutôt qu'échec silencieux | Domaine 4, Messagerie (caméra sans RDV lié) | Blocage expliqué |
| P11 | Rappel répété (2 fois) du caractère public d'une réponse avant de la publier | Domaine 4, Questions clients | Blocage/conséquence expliqué au bon moment |
| P12 | Décision produit de retirer une fonctionnalité demandée plutôt que d'inventer la donnée derrière (score, niveau, responsable, ciblage) | Domaine 3 (Partenariat) ; Domaine 4 (Annonces, ciblage citoyen ; Avis, seuil minimum) | Discipline produit transverse — zéro donnée inventée |
| P13 | "Détails avant modification" — jamais un clic direct vers l'édition, toujours un panneau de détails d'abord | Domaine 5, Espace de travail (Agenda/Tâches/Documents/Projets) | Convention d'interaction cohérente |
| P14 | Garde "modifications non enregistrées" avant fermeture d'un panneau ; suppression honnête sans promesse de corbeille quand elle n'existe pas | Domaine 5, Espace de travail (les 5 sections) | Blocage/conséquence expliqué au bon moment |
| P15 | Blocage expliqué avec règle + raison + marche à suivre concrète en une seule fois, plutôt qu'un simple message d'interdiction | Domaine 7, Paiements (protection du domaine comptable) | Blocage expliqué — le plus complet de l'audit à ce stade |
| P16 | Nommage/scope délibérément distinct pour des concepts financiers proches, chacun répondant à une question précise et non chevauchante — **confirmé sur 5 écrans de la même session (17-18/09/2026)**, pas une décision locale isolée | Domaine 7 (Facturation clients vs Facturation Yelen) ; Domaine 8 (Facturation/Transactions/Frais/Réconciliation Yelen Business, chacun scopé explicitement) | Discipline produit transverse — prévention de confusion par le nommage et le périmètre |

---

### Registre des connaissances transverses (T)

**Taxonomie des registres, définitive à partir du Domaine 5 (Bryan,
21/09/2026)** : P (patterns UX d'aide existants) / T (connaissances
transverses) / UX (problèmes UX à corriger) / M (moments d'aide,
consignés par module dans chaque domaine, pas dans un registre
cross-domaine séparé — trop nombreux et trop locaux pour être
dédupliqués comme T/UX) / À VÉRIFIER (par domaine, jamais refermé sans
preuve). **Ces catégories ne se mélangent plus** — un sujet identifié
comme "problème UX" ci-dessous a été déplacé dans son propre registre
(section suivante) au lieu de rester listé ici avec les vraies
connaissances transverses. Historique de la réorganisation : T4/T6/T7/
T8 (initialement classés ici par erreur de catégorisation avant que la
distinction stricte ne soit demandée) sont devenus UX1/UX2/UX3/UX4 —
voir registre UX, aucune perte d'information, juste un déplacement.

Tenu à jour à chaque domaine — **ne pas dupliquer** un sujet déjà listé
ici : un domaine qui retombe sur une connaissance déjà enregistrée y
ajoute juste une occurrence, il ne réécrit jamais l'explication.
Décision d'architecture (comment/où l'exposer — aide contextuelle,
article, connaissance transverse dédiée) volontairement **non prise
ici**, reportée à la Phase 4.

| # | Sujet | Domaines où ça revient |
|---|---|---|
| T1 | Profil Entreprise (public) vs Profil Responsable (interne) vs Administration & accès (identité de connexion du membre) — 3 écrans au nom proche jamais distingués à l'écran | Domaine 1 |
| T2 | Sécurité du compte (institution-wide, admin) vs Administration & accès (personnel, 5 rôles) — même confusion de nommage | Domaine 1 |
| T3 | Réauthentification récente (`REAUTH_REQUIRED`) jamais expliquée en langage produit malgré son apparition répétée | Domaine 1 (Sécurité du compte, suppression de compte, ajout passkey) |
| T5 | Horaires publics (Profil Entreprise, badge Ouvert/Fermé) vs créneaux réservables (Disponibilités) — deux mécanismes séparés pour un concept proche, dette technique connue côté code | Domaine 1, Domaine 2 |
| T9 | Canaux de communication citoyen↔institution aux règles de visibilité différentes jamais comparés : Questions clients (publique, avant RDV), Messagerie (privée), Avis (publique, après RDV), **+ Signalements bidirectionnels (Domaine 6) : formels et tracés, ni public ni privé au sens des 3 premiers** — 4 canaux au total | Domaine 4, Domaine 6 |
| T10 | 3 systèmes "QR" distincts et sans rapport fonctionnel malgré le même mot : QR public institution (fiche, partage), scan de présence citoyen (check-in RDV), badge QR personnel d'un membre (active un poste d'accueil physique) | Domaine 2, Domaine 5 (revérifié sans nouvelle occurrence au Domaine 6) |
| T11 | Deux formules de score internes coexistent sans vulgarisation produit : score de risque du Journal d'activité (`scoreRisque()`) et score de réputation des Avis (`lib/reputationScore.ts`) | Domaine 4, Domaine 5 (revérifié sans nouvelle occurrence au Domaine 6) |
| T12 | Machines à états avec transitions légales strictes appliquées en code (jamais trigger DB), jamais expliquées en langage produit à l'écran : Signalements (8 statuts), Documents clients (7 statuts), Support Yelen (4 statuts) | Domaine 2, Domaine 4, Domaine 6 |

---

### Registre des problèmes UX à corriger (UX)

Manques de lien, de repère ou d'explication qui se résolvent **d'abord
par une question produit/interface**, pas par un contenu d'aide — le
Help Center ne doit jamais devenir le correctif d'un problème que
l'UX peut résoudre elle-même (ex. deux actions au nom trop proche : la
première question est "peut-on clarifier l'interface ?", pas "quel
article écrire ?"). Décision de correction **non prise ici** — cet
audit isole le problème, ne le corrige pas.

| # | Sujet | Domaines où ça revient | Piste de correction possible (non décidée) |
|---|---|---|---|
| UX1 | Dépendance silencieuse entre deux écrans sans lien croisé dans l'UI (Documents ← Profil Entreprise : le statut juridique doit être rempli ailleurs avant de pouvoir soumettre un document) | Domaine 1 | Lien croisé direct depuis l'écran bloqué vers l'écran à compléter |
| UX2 | Paires d'actions au nom proche, sens différent : "Annuler la validation" vs "Annuler la réservation" (Centre de validation) ; "Refuser" vs "Archiver" (Documents clients) ; "Suspendre" vs "Archiver" (Mes Offres) | Domaine 2, Domaine 3 | Convention de nommage globale à définir avant d'envisager tout contenu d'aide sur ces paires |
| UX3 | Un onglet entier (Mes Offres) disparaît de la navigation selon un état produit (statut partenariat) sans qu'aucun écran ne l'explique côté nav elle-même | Domaine 3 | Indice visuel dans la nav (ex. onglet visible mais verrouillé avec explication) plutôt qu'une disparition totale |
| UX4 | Mécanique de planification de publication présente sur 2 écrans avec un comportement différent — réelle sur Communauté Pro, stub "Bientôt disponible" sur Mes Offres | Domaine 3, Domaine 4 | À surveiller — pas encore confirmé comme un vrai point de friction avant de décider quoi que ce soit |
| UX5 | `yelen-support` visible et cliquable dans la navigation (TAB_MATRIX l'autorise) mais **aucun contenu rendu** (`layout.tsx`, aucun bloc `KeepMounted` pour ce `tabKey`) — différent des 9 autres écrans Yelen Business, qui ont tous un état vide honnête construit | Domaine 8 | Rediriger vers `SupportYelenTab` (Domaine 4) ou construire un état vide honnête équivalent aux 9 autres écrans du domaine |
| UX6 | Notification `type: "signalement"` (`layout.tsx`, cloche institution) clique systématiquement vers l'onglet `rdv`, jamais vers `signalements` — `handleClickNotif` ne branche que sur `rdv_id`, jamais sur `type`, et `rdv_id` est **obligatoire** côté serveur pour ce type de signalement (`app/api/citoyen/signalements/route.ts:132`), donc le mauvais routage est déterministe à 100%, pas un cas limite. `notifications.type` est chargé par l'API mais jamais lu côté client — aucun autre type de notification n'a de routage propre non plus (découvert Phase E.2, vertical slice Signalements, en vérifiant si B3-1 pouvait s'appuyer sur ce mécanisme) | Domaine 6 | Faire brancher `handleClickNotif` sur `type` (ex. `type === "signalement"` → `setTab("signalements")`) plutôt que sur la seule présence de `rdv_id` |

---

## 3. Besoins de support identifiés (1er passage, par les mécanismes déjà vérifiés)

Concentré sur ce qui a une base réelle vérifiée en section 1-2, pas une
liste générique :

- **Onboarding** : "Pourquoi mon code OTP ne fonctionne pas ?" (déjà
  une réponse humanisée, `humanizeVerifyError`, mais seulement dans le
  flux d'inscription, pas ailleurs) · "Combien de temps avant validation
  de mon dossier ?" (le guide l'affirme — 72h ouvrées — jamais vérifié
  contre un SLA réel appliqué en pratique) · "Pourquoi mon compte est
  en attente / a été refusé ?"
- **Centre de configuration** : "Pourquoi je ne peux pas accéder au
  dashboard complet ?" (bloqué tant que les groupes `blocking` ne sont
  pas `done`) · "Cet item est fait mais reste affiché comme manquant" —
  friction connue documentée (CLAUDE.md), bug déjà corrigé une fois
  (institution validée avant l'existence de l'upload documentaire).
- **Sécurité (Yelen Security Activation)** : "Pourquoi mon dashboard
  est bloqué 24h après ma première connexion ?" — mécanisme
  entièrement nouveau (16/09/2026), aucune explication produit visible
  repérée dans ce passage.
- **RBAC / rôles** : "Pourquoi je ne vois pas cet onglet ?" /
  "Pourquoi je peux voir mais pas modifier ?" — **zéro explication
  actuelle**, le masquage `tabAllowed()` est silencieux (Gaps §5).
  `ROLE_DESCRIPTIONS`/`DOMAINE_LABELS` existent déjà comme matière
  première rédactionnelle.
- **Suspension** : "Pourquoi mon compte est suspendu ?" / "Comment
  contester ?" — déjà largement couvert par l'écran structuré
  (`CompteSuspenduScreen.tsx` + révision), bon candidat pour lien direct
  vers le Help Center plutôt qu'un nouvel article générique.
- **Support Yelen (ticketing)** : "Quel est le délai de réponse ?" (un
  indicateur `Disponible`/`Fermé` existe déjà, dérivé d'horaires codés
  en dur, jamais confronté à un vrai SLA) · "Ma conversation est
  résolue, puis-je encore écrire ?" (règle réelle : non, `resolu` ne se
  rouvre plus par un message — comportement produit à documenter tel
  quel, contre-intuitif si non expliqué).
- **Statuts métier sans article dédié repéré** : `statut_rdv`,
  `statut_signalement`/case management,
  `citoyen_documents`/`documents_clients` (7 statuts), `paid_bookings`
  statuts, `badge_verifie` — chacun a des libellés UI (badges colorés)
  mais ce passage n'a pas vérifié l'existence d'un texte explicatif
  long ("que signifie ce statut, que dois-je faire").

Le reste (Finance, Yelen Business, Équipe, Signalements, Documents
clients...) suivra le même exercice une fois la grille 2.2 remplie —
volontairement non halluciné ici.

---

## 4. Éléments déjà existants réutilisables

- **`app/guide-prestataire/page.tsx`** — contenu ignoré (1.7, décision
  Bryan). Le **moteur de rendu** (types de section text/warn/tip/info/
  list/checklist/steps/plans, navigation par chapitre) reste
  potentiellement réutilisable comme patron d'UI si le nouveau Help
  Center adopte une structure similaire — à trancher en Phase 4, jamais
  son contenu.
- **Popover "Aide Yelen"** (`layout.tsx`) — déjà le launcher (recherche,
  raccourci clavier, cartes d'entrée, ressources, légal) : le
  **point d'entrée UI existe déjà**, il manque le contenu structuré
  derrière.
- **`SupportYelenTab.tsx` + `lib/supportTickets.ts`** — ticketing humain
  complet, dernier recours du Help Center ("je n'ai pas trouvé ma
  réponse").
- **`CentreConfigurationTab.tsx` / `configuration-status`** — modèle
  d'aide contextuelle par écran déjà en place (chaque item → un
  `TabKey`), prêt à recevoir un lien d'aide par item.
- **`ROLE_DESCRIPTIONS` / `DOMAINE_LABELS` / `permissionsDuRole()`**
  (`institutionPermissions.ts`) — texte produit déjà rédigé pour "qui
  peut faire quoi", réutilisable tel quel dans un article RBAC.
- **`humanizeVerifyError()`** (`VerificationStep.tsx`) — pattern de
  message d'erreur humanisé, à généraliser plutôt qu'à recréer.
- **`CompteSuspenduScreen.tsx` + `institution_suspensions`/`_revisions`**
  — modèle de communication structurée motif/référence/échéance,
  transposable à d'autres statuts bloquants.
- **`GuideScalingModal`** — contenu de conseils déjà écrit (horaires
  support, etc.), à vérifier s'il fait doublon avec le guide principal.
- **`feedback` route + table `feedback`** — canal existant, pourrait
  informer les priorités de contenu du Help Center (types de friction
  remontés) sans nouvelle construction.
- **`AIDE_CHAPITRES`** — déjà l'embryon d'un index de recherche, à
  remplacer par un vrai index si le contenu devient structuré/multiple.

---

## 5. Gaps (EXISTE / PARTIEL / ABSENT / À VÉRIFIER)

| Élément | État | Constat |
|---|---|---|
| Point d'entrée UI Help Center (launcher, recherche, raccourci clavier) | **EXISTE** | Popover "Aide Yelen", `layout.tsx` L3889+ |
| Contenu documentaire structuré (base de données, éditable) | **ABSENT** | `guide-prestataire` est un tableau JS codé en dur, aucune table `articles`/`collections`, aucun CMS admin |
| Contenu de `guide-prestataire` comme base du Help Center | **ABSENT (décision, pas un gap à combler)** | Ancien contenu, ignoré complètement (décision Bryan 21/09/2026, 1.7) — le Help Center repart de zéro sur le contenu |
| Ticketing humain (dernier recours) | **EXISTE** | `support_tickets` institution, zéro LLM, conforme `/stack-specifique` |
| Aide contextuelle par écran/onglet | **ABSENT** | Aucun `TabKey` ne linke vers un article correspondant, seul le deep-link `?chapitre=` existe pour le guide entier |
| Explication du masquage RBAC ("pourquoi cet onglet est absent") | **ABSENT** | `tabAllowed()` masque silencieusement, aucun message produit repéré |
| FAQ structurée par domaine fonctionnel | **ABSENT** | 10 chapitres génériques, pas organisés par les 8 domaines réels de 2.1 |
| Recherche dans l'aide | **PARTIEL** | Filtrage sur titres seulement (`AIDE_CHAPITRES`), pas de recherche plein texte, pas de résultats hors guide (ex. articles RBAC/statuts inexistants) |
| Messages d'erreur humanisés | **PARTIEL** | Pattern existant (`humanizeVerifyError`) mais localisé à un seul flux, non catalogué/généralisé |
| Explication des statuts métier (RDV, signalements, documents, badge) | **À VÉRIFIER** | Badges UI existent, présence de texte explicatif long non confirmée dans ce passage |
| Aide contextuelle onboarding (Centre de configuration) | **EXISTE (ancrage) / ABSENT (contenu)** | Structure `TabKey`-par-item déjà là, aucun lien d'aide branché dessus |
| Aide côté portail employé (Clock In Shift) | **ABSENT** | Aucune trace trouvée dans `app/clock/**` |
| Cohérence des canaux de contact affichés | **À VÉRIFIER** | Emails différents entre `AideSupportTab` et `guide-prestataire` (1.7) |
| Relation entre `AideSupportTab` (onglet) et popover header | **À VÉRIFIER** | Deux points d'entrée d'aide non réconciliés, un des deux potentiellement obsolète |
| Mesure d'usage de l'aide (quels articles consultés, quelles recherches sans résultat) | **ABSENT** | Aucun tracking repéré |
| Grille détaillée par fonctionnalité (2.2, 47 écrans × 8 attributs) | **À FAIRE** | Reporté au(x) lot(s) suivant(s), non halluciné ici |

---

## 6. Questions ouvertes

1. ~~`AideSupportTab.tsx` vs popover "Aide Yelen"~~ — **TRANCHÉ**
   (21/09/2026) : `AideSupportTab.tsx` retiré, doublon confirmé. Le
   popover "Aide Yelen" reste l'unique point d'entrée d'aide du
   dashboard.
2. ~~Fiabilité du contenu de `guide-prestataire`~~ — **TRANCHÉ**
   (21/09/2026) : ignoré complètement, contenu neuf à écrire (1.7).
   Reste ouvert en revanche : que devient la page `/guide-prestataire`
   elle-même (retirée, laissée hors périmètre, remplacée par le nouveau
   Help Center à la même URL) ?
3. **Modèle de contenu** : rester sur du contenu codé en dur (comme
   aujourd'hui, cohérent avec le principe "seul dev, pas de CMS admin"
   du projet) ou construire une table `help_articles`/`help_collections`
   éditable ? Impacte fortement l'effort et qui peut maintenir le
   contenu dans la durée.
4. **Portée employé (Clock In Shift)** : ce chantier "prestataire"
   inclut-il le portail employé (population distincte, cf. CLAUDE.md),
   ou reste-t-il hors périmètre pour l'instant ?
5. **Aide contextuelle par écran** : construire un mapping `TabKey` →
   article(s), en s'appuyant sur `TAB_KEYS`/`ACTION_MATRIX` déjà
   existants (section 1.2), plutôt qu'un Help Center uniquement
   accessible depuis le header ?
6. **Exposer le RBAC** : faut-il qu'un onglet/action bloqué par un rôle
   affiche un lien "En savoir plus" vers un article explicatif plutôt
   que le masquage silencieux actuel ?
7. **Canaux de contact** : lequel des emails/téléphones affichés à deux
   endroits différents (1.7) est la source de vérité actuelle ?
8. **Grille détaillée 2.2** : à faire en une passe complète séparée, ou
   domaine par domaine au fil des lots d'implantation (Phase 5) ?

---

## 7. Propositions d'implantation

Vide — à remplir après validation de l'audit par Bryan (Phase 3/4).

---

# PHASE B — Corpus Support réel prestataire (21/09/2026)

**Séquence officielle du chantier (validée par Bryan, 21/09/2026)** :
Phase A — Audit technique ✅ (8/8 domaines) · **Phase B1 — Cartographie
des sources support ✅ (3 sources réelles, cette section)** · Phase B2
— Mesure des données réelles 🔜 (requêtes candidates listées en 8.5,
aucune exécutée) · Phase B3 — Croisement Support réel × Produit réel ·
Phase C — Priorisation · Phase D — Architecture du Provider Help
Center · Phase E — Première implantation. Nous sommes à la fin de
**Phase B1**, sur le point d'entamer B2.

Objectif de Phase B : comprendre ce que les prestataires demandent
**réellement** à Yelen aujourd'hui — pas encore décider quoi
construire. Les registres P/T/UX/M de la Phase A **ne sont pas
modifiés** dans cette section ; le corpus support reste volontairement
séparé pour permettre un vrai croisement en Phase B3, pas une fusion
prématurée.

**Méthode et limite assumée** : cet inventaire est fait par lecture de
code (routes API, fonctions d'agrégation, migrations), **jamais par
exécution de requête SQL** — seul Bryan exécute du SQL sur ce projet.
Je peux donc dire **quelles sources existent et ce qu'elles peuvent
révéler**, mais pas **combien de tickets/signalements/feedback réels
existent, ni leur contenu, ni leur fréquence réelle**. Rien n'est
inventé ou estimé à la place.

**Règle de vocabulaire (Bryan, 21/09/2026)** : partout où une mesure
n'a pas été faite, le document écrit **NON DISPONIBLE / NON AGRÉGÉ**,
jamais "0" ou "aucune". "Aucune occurrence" (une vraie mesure donnant
zéro) et "nous n'avons pas encore mesuré" sont deux états différents —
ce document ne confond jamais les deux.

**Troisième dimension à prévoir pour plus tard (notée ici, pas encore
disponible)** : une fois un Help Center réellement en place, les
**recherches sans résultat** et les **recherches sans clic** en son
sein deviendront un indicateur direct des lacunes de contenu — une
source qui n'existe pas encore aujourd'hui puisque le Help Center
lui-même n'existe pas. À réintégrer dans Phase B2/B3 une fois
construit, jamais avant.

## 8.1 Sources réellement disponibles (confirmées dans le code)

### Support Yelen — ticketing agent humain (`support_tickets`)

**La source la plus riche et la mieux structurée.** Contrairement à ce
que section 1.8 (Phase A) affirmait ("table(s) séparée(s) de la version
citoyen — à confirmer"), la lecture directe de la migration
`20260906000004_support_tickets_institution.sql` **corrige ce point** :
il s'agit de la **même table `support_tickets`**, étendue par
`ALTER TABLE` avec une colonne `institution_id` (mutuellement exclusive
avec `citoyen_id`, contrainte CHECK `support_tickets_une_seule_origine`)
— pas une table séparée. **Correction actée ici plutôt que dans la
section 1.8 elle-même**, pour ne pas modifier la baseline Phase A déjà
validée (cohérent avec la consigne de conservation).

Conséquence concrète : `lib/supportTickets.ts::fileAttenteAgent()`
(consommée par `app/admin/support/page.tsx` via
`app/api/admin/support/route.ts`) retourne **une file d'attente unifiée
citoyen + institution**, avec un champ `origine: "institution"|"citoyen"`
par ticket, et des **compteurs déjà calculés par statut** (`attente_agent`/
`en_cours`/`resolu`/`cloture`) — mais **ces compteurs sont globaux, pas
scindés par origine ni par catégorie**. Un admin devrait filtrer
manuellement pour isoler les tickets institution.

- **Catégories institution réelles** (`SUPPORT_CATEGORIES_INSTITUTION`,
  `lib/supportTicketsConstants.ts`) : `compte`, `facturation`, `client`,
  `technique`, `partenariat`, `securite`, `autre` — 7 valeurs, dont 3
  sans équivalent citoyen (`facturation`, `client`, `partenariat`).
- **Priorité dérivée automatiquement** de la catégorie
  (`prioriteInitiale()`) — jamais choisie par l'expéditeur.
- **Ce qui N'EST PAS déjà agrégé/consultable** : aucun comptage par
  catégorie, aucun temps de résolution calculé (`resolu_le`/`cree_le`
  existent comme colonnes mais ne sont jamais soustraits nulle part
  dans le code lu), aucune distinction citoyen/institution dans les
  compteurs eux-mêmes, aucune vue "motifs les plus fréquents".
- **Accessible comment** : `app/admin/support/page.tsx` (console agent,
  déjà en usage réel si des tickets existent) — Bryan peut consulter
  visuellement dès aujourd'hui sans requête SQL. Mais pour une
  **analyse quantitative** (fréquence par catégorie, temps de
  résolution moyen), une requête SQL directe reste nécessaire (8.5).

### Signalements — deux systèmes bien distincts, à ne pas confondre pour cette analyse

- **Signalements "Communauté"** (`app/admin/moderation/page.tsx`,
  section historique, `app/api/admin/signalements/route.ts`) : **exclut
  explicitement** (`is('type_signaleur', null)`) les dossiers
  institution/citoyen du case management (Domaine 6) — ce flux ne
  concerne **pas** les prestataires au sens de ce chantier. À écarter
  du corpus support prestataire.
- **Signalements case management institution/citoyen**
  (`app/api/admin/signalements-cas/**`, consommé par une section dédiée
  de `app/admin/moderation/page.tsx`) : **c'est la vraie source** pour
  ce chantier — inclut les signalements bidirectionnels du Domaine 6
  (déposés par l'institution ET reçus contre elle). **Aucun comptage/
  agrégat trouvé dans le code lu** — la page charge une liste brute
  (`fetch('/api/admin/signalements-cas')`), sans calcul de fréquence
  par motif ni de délai de traitement. Les motifs réels sont déjà
  connus structurellement (`SIGNALEMENT_MOTIFS_INSTITUTION`,
  `lib/signalementsConstants.ts` — liste non reproduite ici, déjà
  référencée section Domaine 6) mais **leur fréquence réelle
  d'utilisation est inconnue sans requête SQL**.

### Feedback (`feedback` table, `app/api/admin/feedback/route.ts`)

Canal institution → Yelen à sens unique (type `bug`/`suggestion`/`ux`/
`fonctionnalite`, confirmé Phase A section 1.9). L'écran admin est une
**liste paginée filtrable par statut** (`nouveau`/`lu`/`traite`),
**sans aucun comptage par type** — un admin ne peut pas voir d'un coup
d'œil "combien de bugs vs combien de suggestions" sans compter
manuellement ou requêter directement.

### Sources absentes ou hors périmètre (vérifié, pas supposé)

- **Recherche sans résultat côté institution** : **ABSENT**. La seule
  table de ce type trouvée (`recherches_populaires`,
  migration `20260808000001`) est exclusivement côté citoyen
  (`app/recherche/RechercheOverlay.tsx`) — aucun équivalent côté
  dashboard institution.
- **Vue/fonction SQL d'agrégation** : **ABSENT**. Recherche dans
  `supabase/migrations/` pour des `CREATE VIEW`/`CREATE FUNCTION`
  liés à `support_tickets`/`signalements`/`feedback` : seules des
  fonctions techniques trouvées (génération de numéro public, trigger
  d'immuabilité) — aucune vue de statistiques.
- **Escalade réelle** (`SIGNALEMENT_ESCALADE_NIVEAUX`, Domaine 6) :
  le mécanisme existe dans le modèle de données, mais **aucune donnée
  sur sa fréquence d'usage réelle** n'est accessible sans requête SQL.
- **Temps de résolution / effort** : **ABSENT comme métrique déjà
  calculée**, sur les 3 sources (support, signalements-cas, feedback).
  Dérivable uniquement par calcul direct sur les timestamps bruts
  (`cree_le`/`resolu_le`/`cloture_le` selon la table), jamais fait par
  le code existant.

## 8.2 Ce que je NE peux pas déterminer sans requête SQL exécutée par Bryan

Explicitement, pour ne jamais laisser croire à une donnée observée :
volume réel de tickets institution (total, par catégorie, par mois) ;
contenu réel des messages (quels problèmes précis reviennent) ; délai
moyen réel de prise en charge/résolution ; taux de tickets réouverts ;
volume et motifs réels des signalements bidirectionnels ; répartition
réelle des types de feedback ; fréquence réelle d'usage de l'escalade.
**Rien de tout cela n'est estimé ici — chaque case correspondante
ci-dessous porte NON DISPONIBLE / NON AGRÉGÉ, jamais "0".**

## 8.3 Grille structurelle par source (capacités, pas contenu réel)

| Source | Problème détectable | Fréquence | Contexte disponible ? | Module Yelen concerné | Réponse actuelle donnée | Temps/effort | Escalade | Domaine Phase A |
|---|---|---|---|---|---|---|---|---|
| Support Yelen (catégorie `compte`) | Oui, par lecture manuelle des tickets | NON DISPONIBLE / NON AGRÉGÉ (pas de comptage par catégorie) | Oui (sujet + fil de messages) | Sécurité du compte / Administration & accès | Réponse humaine libre, agent Yelen | NON DISPONIBLE / NON AGRÉGÉ (dérivable de `cree_le`/`resolu_le`, jamais calculé) | Mécanisme inexistant sur ce système (structurel, pas une non-mesure) | Domaine 1 |
| Support Yelen (catégorie `facturation`) | Oui | NON DISPONIBLE / NON AGRÉGÉ | Oui | Voir "Ambiguïtés de classification support" ci-dessous | Réponse humaine libre | NON DISPONIBLE / NON AGRÉGÉ | Mécanisme inexistant sur ce système | Domaine 7 et/ou 8 |
| Support Yelen (catégorie `client`) | Oui | NON DISPONIBLE / NON AGRÉGÉ | Oui | Mes clients, Signalements | Réponse humaine libre | NON DISPONIBLE / NON AGRÉGÉ | Mécanisme inexistant sur ce système | Domaine 2, Domaine 6 |
| Support Yelen (catégorie `partenariat`) | Oui | NON DISPONIBLE / NON AGRÉGÉ | Oui | Partenariat, Mes Offres | Réponse humaine libre | NON DISPONIBLE / NON AGRÉGÉ | Mécanisme inexistant sur ce système | Domaine 3 |
| Support Yelen (catégorie `technique`/`securite`/`autre`) | Oui | NON DISPONIBLE / NON AGRÉGÉ | Oui | Transverse | Réponse humaine libre | NON DISPONIBLE / NON AGRÉGÉ | Mécanisme inexistant sur ce système | Transverse |
| Signalements-cas (institution↔citoyen) | Oui, par lecture manuelle | NON DISPONIBLE / NON AGRÉGÉ (liste brute, aucun comptage) | Oui (fiche complète, historique) | Signalements | Workflow case management (Domaine 6) | NON DISPONIBLE / NON AGRÉGÉ | Mécanisme réel et existant (`SIGNALEMENT_ESCALADE_NIVEAUX`) — fréquence d'usage NON DISPONIBLE / NON AGRÉGÉ | Domaine 6 |
| Feedback (`bug`/`suggestion`/`ux`/`fonctionnalite`) | Oui, par lecture manuelle | NON DISPONIBLE / NON AGRÉGÉ (liste brute filtrable par statut seulement) | Oui (message libre) | Transverse (dépend du contenu) | Aucune réponse à l'institution (canal à sens unique) | Non applicable (pas un workflow de résolution) | Mécanisme inexistant sur ce système | Transverse |

**Lecture de cette grille** : chaque ligne représente une **catégorie
structurelle déjà connue du code**, pas un problème réel observé. Le
mapping "module Yelen concerné" est une **correspondance de nommage
raisonnable** (ex. catégorie `partenariat` → Domaine 3), pas une
correspondance validée par du contenu réel — à confirmer une fois les
vraies données consultées.

## 8.4 Correspondances Support ↔ Corpus A — prudentes, non forcées

Conformément à la consigne ("ne force pas de correspondance"), seules
les correspondances **structurellement garanties par le code** (pas
des suppositions) sont listées :

- Catégorie support `partenariat` ↔ Domaine 3 (Partenariat/Mes Offres) —
  garanti par le nom de la catégorie elle-même, contenu réel non vérifié.
- Signalements-cas bidirectionnels ↔ Domaine 6 — garanti (même table,
  même mécanisme déjà audité).
- Aucune autre correspondance forcée — les catégories `compte`,
  `technique`, `securite`, `autre`, `client` sont trop larges pour
  pointer vers un domaine unique sans lire le contenu réel des tickets.
- La catégorie `facturation` n'est **volontairement pas** mappée ici —
  voir section dédiée ci-dessous.

### AMBIGUÏTÉS DE CLASSIFICATION SUPPORT

Section distincte, volontairement séparée du registre T (Corpus A) —
ce sont des ambiguïtés **de classification support**, pas des
connaissances transverses du produit. Une catégorie support qui
recouvre potentiellement 2 réalités produit n'est pas, par elle seule,
une preuve qu'un prestataire confond réellement les deux — seul le
contenu des tickets pourra le confirmer.

- **`facturation`** (catégorie Support Yelen institution) peut
  correspondre à **Facturation clients** (Domaine 7, argent des clients
  de l'institution) **ou** à **Facturation Yelen** (Domaine 8, ce que
  l'institution doit à Yelen) — rien dans le seul mot de catégorie ne
  permet de trancher avant lecture du contenu réel du ticket. Point de
  vigilance en écho à **P16** (Corpus A, nommage volontairement
  distinct des 2 écrans produit) : si cette ambiguïté se confirme
  fréquente dans les tickets réels, cela indiquerait que la distinction
  déjà bien pensée *dans l'interface* ne l'est pas encore *au moment de
  la demande de support* — une observation utile pour Phase B3, **pas
  encore une connaissance T** tant qu'aucun contenu réel ne l'a confirmée.

## 8.5 Requêtes SQL candidates — non retenues, non exécutées

**Statut : candidates de mesure, conservées pour décision commune.**
Avant de retenir une requête pour exécution (Phase B2), chacune doit
répondre à 4 questions — posées explicitement ci-dessous plutôt que
suggérées implicitement par le SQL seul :

1. **Volume et répartition des tickets support institution**
   - *Quel problème cherchons-nous à mesurer ?* Est-ce que certaines
     catégories dominent largement les autres (signal de priorité) ou
     la répartition est-elle plate (signal qu'aucune catégorie seule
     ne justifie un traitement prioritaire) ?
   - *Quelle source ?* `support_tickets`, filtré `institution_id IS NOT NULL`.
   - *Quelle période ?* À définir avec Bryan — depuis le lancement du
     chantier "Support Yelen institution" (06/09/2026) semble le plus
     honnête (avant cette date, aucun ticket institution ne pouvait exister).
   - *Quel résultat permet une décision ?* Une catégorie qui domine
     largement devient candidate à une investigation qualitative plus
     poussée (lecture du contenu réel) — pas automatiquement à un article.
   ```sql
   SELECT categorie, statut, COUNT(*)
   FROM support_tickets
   WHERE institution_id IS NOT NULL
   GROUP BY categorie, statut
   ORDER BY COUNT(*) DESC;
   ```

2. **Délai moyen de résolution par catégorie**
   - *Quel problème ?* Certaines catégories prennent-elles
     structurellement plus de temps à résoudre — signal possible d'un
     problème mal outillé côté agent, pas forcément côté prestataire.
   - *Quelle source ?* `support_tickets`, tickets institution résolus
     uniquement (`resolu_le IS NOT NULL`).
   - *Quelle période ?* Même fenêtre que la requête 1, pour rester comparable.
   - *Quel résultat permet une décision ?* Un délai anormalement long
     sur une catégorie précise oriente vers une investigation qualitative
     (pourquoi), pas vers une conclusion automatique.
   ```sql
   SELECT categorie, AVG(EXTRACT(EPOCH FROM (resolu_le - cree_le))/3600) AS heures_moyennes
   FROM support_tickets
   WHERE institution_id IS NOT NULL AND resolu_le IS NOT NULL
   GROUP BY categorie;
   ```

3. **Volume et motifs des signalements bidirectionnels**
   - *Quel problème ?* Le Domaine 6 (Signalements) a-t-il un usage réel
     significatif, et dans quel sens (institution→citoyen ou
     citoyen→institution) ? Aide à juger si les moments d'aide déjà
     identifiés au Domaine 6 (M) sont rencontrés en pratique.
   - *Quelle source ?* `signalements`, filtré `type_signaleur IS NOT NULL`.
   - *Quelle période ?* Depuis le chantier case management (08/08/2026)
     ou depuis le chantier bidirectionnel (15/08/2026) selon ce qu'on
     veut isoler.
   - *Quel résultat permet une décision ?* Un motif récurrent devient
     candidat à une connaissance transverse potentielle (T) — pas
     automatique, dépend du contenu.
   ```sql
   SELECT motif, type_signaleur, statut, COUNT(*)
   FROM signalements
   WHERE type_signaleur IS NOT NULL
   GROUP BY motif, type_signaleur, statut
   ORDER BY COUNT(*) DESC;
   ```

4. **Répartition du feedback institution par type**
   - *Quel problème ?* Le canal feedback sert-il surtout à signaler des
     bugs (signal produit, pas documentation) ou des demandes de
     fonctionnalité (signal produit également) — à distinguer d'un
     vrai besoin d'aide/documentation, qui n'est probablement pas ce
     que ce canal capture.
   - *Quelle source ?* `feedback`.
   - *Quelle période ?* Depuis la création du canal (à confirmer la
     date exacte avant d'exécuter — non vérifiée dans ce passage).
   - *Quel résultat permet une décision ?* Probablement aucune décision
     Help Center directe — sert surtout à confirmer que ce canal
     n'est pas la bonne source pour ce chantier (déjà suspecté en 8.1).
   ```sql
   SELECT type, statut, COUNT(*)
   FROM feedback
   GROUP BY type, statut
   ORDER BY COUNT(*) DESC;
   ```

5. **Fréquence réelle d'usage de l'escalade sur les signalements-cas**
   - *Quel problème ?* L'escalade (agent→superviseur→admin) est-elle
     réellement utilisée, ou un mécanisme construit mais jamais
     déclenché en pratique ?
   - *Quelle source ?* `signalements`, filtré `type_signaleur IS NOT NULL`.
   - *Quelle période ?* Même fenêtre que la requête 3.
   - *Quel résultat permet une décision ?* Un usage quasi nul
     orienterait vers "pas une priorité de contenu d'aide" ; un usage
     fréquent orienterait vers l'inverse — mais seulement combiné à une
     lecture qualitative du motif d'escalade, pas au chiffre seul.
   ```sql
   SELECT escalade_niveau, COUNT(*)
   FROM signalements
   WHERE type_signaleur IS NOT NULL
   GROUP BY escalade_niveau;
   ```

**Aucune de ces 5 requêtes n'est exécutée.** La sélection de
lesquelles retenir pour Phase B2, et dans quel ordre, reste une
décision à prendre ensemble.

## 8.6 État de cette phase

**Phase B1 (cartographie des sources) terminée et validée.** Corpus =
inventaire structurel des 3 sources réelles, pas encore un corpus de
problèmes réels. Les registres P/T/UX/M de la Phase A restent
inchangés. Aucune correspondance forcée (l'ambiguïté `facturation` est
isolée dans sa propre section, pas dans le registre T). Aucune
priorité proposée.

---

# PHASE B2 — Mesure des données réelles (Étape 1 : sélection, aucune exécution)

**Règle fondamentale rappelée** : aucun chiffre inventé, extrapolé ou
interprété au-delà de ce que chaque requête permet d'établir. Cette
étape classe les 5 requêtes candidates de 8.5 — **aucune n'est
exécutée ici**.

## 8.7 Étape 1 — Classement des 5 requêtes candidates

### Requête 1 — Volume et répartition des tickets support institution

- **Question mesurée** : une ou plusieurs catégories de tickets
  institution dominent-elles nettement les autres, et comment les
  statuts se répartissent-ils à l'intérieur de chaque catégorie ?
- **Source** : `support_tickets`.
- **Période proposée** : sans borne basse explicite nécessaire — la
  colonne `institution_id` n'existe que depuis la migration
  `20260906000004` (06/09/2026), donc structurellement aucun ticket
  institution ne peut exister avant cette date. Borne haute : date
  d'exécution réelle, à noter dans le résultat pour rester reproductible.
- **Population** : toutes les lignes `support_tickets` où
  `institution_id IS NOT NULL`, tout statut, toute catégorie.
- **Résultat attendu** : table catégorie × statut × nombre.
- **Décision que ce résultat pourrait éclairer** : identifie les
  catégories candidates à une investigation qualitative du contenu réel
  (Étape 4) — ne décide rien seule.
- **Classement : RETENIR.** Champs et filtre déjà vérifiés réels
  (8.8), aucune confusion citoyen/institution possible (filtre
  explicite sur une colonne dont la présence NULL/non-NULL est
  mutuellement exclusive par contrainte CHECK en base).

### Requête 2 — Délai moyen de résolution par catégorie

- **Question mesurée** : certaines catégories prennent-elles
  structurellement plus de temps entre la création du ticket et sa
  résolution ?
- **Source** : `support_tickets`.
- **Période proposée** : même fenêtre que la requête 1.
- **Population** : `institution_id IS NOT NULL AND resolu_le IS NOT NULL`
  (tickets institution effectivement résolus).
- **Résultat attendu** : catégorie × délai moyen en heures.
- **Décision que ce résultat pourrait éclairer** : un délai anormalement
  élevé sur une catégorie précise oriente vers une investigation
  qualitative (pourquoi), jamais vers une conclusion automatique.
- **Classement : MODIFIER.** Point du garde-fou Étape 2
  ("création/résolution, ne pas confondre") directement applicable
  ici : `resolu_le - cree_le` mesure le **délai total** (temps d'attente
  d'un agent + temps de traitement une fois pris en charge confondus),
  **pas** le temps de traitement agent seul. Aucune colonne
  `pris_en_charge_le` n'existe sur `support_tickets` — la seule autre
  source d'horodatage intermédiaire serait `support_ticket_events`
  (type `assigned`), qui demanderait une jointure non prévue dans la
  requête candidate. **Modification proposée** : conserver la requête
  telle quelle mais renommer explicitement le résultat "délai total
  création→résolution" (jamais "temps de traitement") dans toute
  restitution — pas de jointure supplémentaire proposée à ce stade
  (complexité non justifiée tant qu'on ne sait pas si la distinction
  attente/traitement est réellement utile à la décision).

### Requête 3 — Volume et motifs des signalements bidirectionnels

- **Question mesurée** : quels motifs de signalement reviennent, et
  dans quel sens (déposé par l'institution vs reçu contre elle) ?
- **Source** : `signalements`.
- **Période proposée** : depuis le chantier bidirectionnel (15/08/2026)
  si on veut isoler le comportement actuel uniquement, ou depuis le
  chantier case management d'origine (08/08/2026) pour une vue plus
  longue — à trancher avec Bryan, aucune des deux n'est fausse.
- **Population** : `type_signaleur IS NOT NULL` (exclut les
  signalements "Communauté", confirmé par le commentaire de
  `app/api/admin/signalements/route.ts` : ces lignes n'ont jamais
  `type_signaleur` renseigné).
- **Résultat attendu** : motif × sens × statut × nombre.
- **Décision que ce résultat pourrait éclairer** : un motif récurrent
  devient candidat à une investigation qualitative — pas automatiquement
  à une connaissance T.
- **Classement : RETENIR.** La requête groupe déjà par `type_signaleur`
  **et** `motif` ensemble — pas de risque de mélanger les vocabulaires
  de motifs institution/citoyen (confirmé distincts, Domaine 6) sous un
  même total.

### Requête 4 — Répartition du feedback institution par type

- **Question mesurée** : quels types de feedback (bug/suggestion/ux/
  fonctionnalité) dominent ?
- **Source** : `feedback`.
- **Population** : toutes les lignes (confirmé institution-only, 8.8).
- **Résultat attendu** : type × statut × nombre.
- **Décision que ce résultat pourrait éclairer** : en théorie, savoir
  si le canal capture surtout des bugs ou des demandes de fonctionnalité.
- **Classement : ÉCARTER.** Pas un problème de fiabilité des données
  (le périmètre est propre, vérifié 8.8) mais un problème de
  **pertinence pour ce chantier précis** : `feedback` est un canal
  produit à sens unique ("ce que l'institution voudrait voir changer"),
  pas un canal de demande d'aide ("ce que l'institution n'arrive pas à
  faire"). Même un résultat complet ne répondrait pas à la question de
  Phase B ("que demandent réellement les prestataires en aide"). Écarté
  pour ce chantier, pas supprimé du corpus des sources (reste noté en 8.1).

### Requête 5 — Fréquence réelle d'usage de l'escalade

- **Question mesurée** : l'escalade (agent→superviseur→admin) est-elle
  réellement utilisée, ou un mécanisme construit mais jamais déclenché ?
- **Source** : `signalements`.
- **Période proposée** : même fenêtre que la requête 3.
- **Population** : `type_signaleur IS NOT NULL`.
- **Résultat attendu** : niveau d'escalade × nombre.
- **Décision que ce résultat pourrait éclairer** : un usage quasi nul
  orienterait vers "pas une priorité de contenu d'aide" pour l'instant ;
  un usage fréquent orienterait vers une lecture qualitative des motifs
  d'escalade — jamais vers une décision au chiffre seul.
- **Classement : RETENIR.** Point de vigilance déjà vérifié en 8.8 :
  `escalade_niveau` est `NOT NULL DEFAULT 'agent'` — donc "agent" dans
  le résultat signifie **"jamais escaladé"** (le niveau de départ, pas
  une donnée manquante), à interpréter ainsi et pas comme une case
  vide.

## 8.8 Étape 2 — Validation du périmètre (avant toute exécution des requêtes RETENIR/MODIFIER)

Vérification des champs réellement utilisés dans les requêtes
classées RETENIR (1, 3, 5) et MODIFIER (2), contre le code source —
**aucune connexion à la base, uniquement relecture du code déjà audité** :

| Champ utilisé | Table | Vérifié réel où | Risque de confusion (checklist Bryan) | Statut |
|---|---|---|---|---|
| `institution_id` | `support_tickets` | `lib/supportTickets.ts:591`, migration `20260906000004` | citoyen/institution — mutuellement exclusif par CHECK `support_tickets_une_seule_origine` | Vérifié, sûr |
| `categorie`, `statut`, `cree_le` | `support_tickets` | `lib/supportTickets.ts:591` (`.select(...)`) | catégorie Support ≠ domaine Yelen — **volontairement non résolu par SQL**, voir Étape 5 | Vérifié, sûr |
| `resolu_le` | `support_tickets` | `lib/supportTickets.ts:292,532,745` (`.update({statut:"resolu", resolu_le: ...})`) | création/résolution — délai total, pas temps de traitement agent seul (voir requête 2, MODIFIER) | Vérifié, sûr avec la clarification apportée |
| `motif`, `type_signaleur`, `statut` | `signalements` | `SignalementsTab.tsx` (types `Signalement`, Domaine 6) | ticket/signalement — table distincte de `support_tickets`, aucun risque de mélange | Vérifié, sûr |
| `escalade_niveau` | `signalements` | `lib/signalements.ts:220-228` ; défaut confirmé migration `20260808000004:60-61` (`NOT NULL DEFAULT 'agent'`) | absence de donnée vs valeur nulle — **pas de NULL possible**, "agent" = non-escaladé par construction | Vérifié, sûr |
| `type`, `statut`, `institution_id` | `feedback` | `app/api/admin/feedback/route.ts`, seul point d'insertion trouvé : `app/api/institution/feedback/route.ts:26` | feedback/support ; citoyen/institution — **un seul chemin d'écriture trouvé dans tout `app/`**, confirmé institution-only | Vérifié, sûr — mais requête déjà classée ÉCARTER (pertinence, pas fiabilité) |

**Aucun champ non vérifié parmi les requêtes RETENIR/MODIFIER.** Aucune
requête n'est classée **NON MESURABLE AVEC LES DONNÉES ACTUELLES** — les
3 retenues (1, 3, 5) et la modifiée (2) reposent toutes sur des colonnes
confirmées réelles dans le code déjà lu.

## 8.9 Résumé du classement

| # | Requête | Classement |
|---|---|---|
| 1 | Volume/répartition tickets support institution | **RETENIR** |
| 2 | Délai moyen de résolution par catégorie | **MODIFIER** (clarifier "délai total", pas "temps de traitement") |
| 3 | Volume et motifs des signalements bidirectionnels | **RETENIR** |
| 4 | Répartition du feedback institution par type | **ÉCARTER** (hors périmètre de la question posée par ce chantier) |
| 5 | Fréquence d'usage de l'escalade | **RETENIR** (avec interprétation "agent" = non-escaladé) |

**Aucune requête exécutée à ce stade.** Prochaine action : décision
commune sur l'exécution des 3 requêtes RETENIR + la requête 2 modifiée
(Étape 3), puis lecture qualitative du contenu réel derrière les
catégories qui ressortent (Étape 4), en particulier `facturation`
(Étape 5, ambiguïté Domaine 7/8).

---

## 8.10 Étape 3 — Résultats mesurés (exécutés par Bryan, 21/09/2026)

**Avertissement méthodologique impératif, valable pour les 4 requêtes
ci-dessous** : les volumes obtenus sont **extrêmement faibles** (1
ticket support, 4 signalements case management au total). Ce ne sont
pas des échantillons représentatifs — probablement les toutes
premières lignes réelles depuis le lancement de ces chantiers
(support institution : 06/09/2026 ; signalements bidirectionnels :
15/08/2026), pas un régime d'usage stabilisé. **Conformément à la
consigne de Bryan, aucune conclusion de fréquence, de priorité ou de
tendance n'est tirée de ces chiffres** — ils sont consignés tels
quels, comme un point de mesure initial, rien de plus.

### Q1 — Volume et répartition des tickets support institution

1. **Période exacte analysée** : aucune borne de date dans la requête
   (`WHERE institution_id IS NOT NULL` uniquement) — couvre donc tout
   l'historique possible, borné structurellement par la création de la
   colonne `institution_id` (migration `20260906000004`, 06/09/2026)
   jusqu'à la date d'exécution (21/09/2026, non horodatée précisément
   dans le retour de Bryan — limite notée ci-dessous).
2. **Population exacte** : toutes les lignes `support_tickets` où
   `institution_id IS NOT NULL`, tout statut, toute catégorie.
3. **Nombre total d'enregistrements** : **1**.
4. **Résultat brut par catégorie/statut** :

   | Catégorie | Statut | Nombre |
   |---|---|---|
   | `compte` | `resolu` | 1 |

   Aucune autre combinaison catégorie/statut présente — les 6 autres
   catégories institutionnelles (`facturation`, `client`, `technique`,
   `partenariat`, `securite`, `autre`) et les 3 autres statuts
   (`attente_agent`, `en_cours`, `cloture`) ont **0 ligne**, pas
   "non disponible" ici (une requête complète a bien été exécutée sur
   toute la population, l'absence est donc une vraie mesure, pas une
   lacune de collecte).
5. **Valeurs nulles/exclusions** : aucune — la requête n'exclut rien
   au-delà du filtre `institution_id IS NOT NULL` lui-même.
6. **Limites** : échantillon n=1, **aucune conclusion de répartition
   ou de dominance de catégorie possible**. Heure d'exécution exacte
   non capturée (limite de traçabilité du process, pas de la donnée
   elle-même) — à noter pour une prochaine mesure si la reproductibilité
   stricte devient importante.
7. **Requête exécutée** :
   ```sql
   SELECT categorie, statut, COUNT(*)
   FROM support_tickets
   WHERE institution_id IS NOT NULL
   GROUP BY categorie, statut
   ORDER BY COUNT(*) DESC;
   ```

### Q2 — Délai total création→résolution

1. **Période exacte analysée** : identique à Q1 (aucune borne de date
   explicite, même fenêtre structurelle).
2. **Population exacte** : lignes `support_tickets` où
   `institution_id IS NOT NULL AND resolu_le IS NOT NULL` — dans les
   faits, strictement la même unique ligne que Q1 (elle est déjà
   `resolu`), aucune ligne exclue par le filtre `resolu_le IS NOT NULL`
   puisqu'aucune autre ligne n'existe.
3. **Nombre total d'enregistrements** : **1** (`nb_resolus = 1`).
4. **Résultat brut** :

   | Catégorie | Nb résolus | Délai total moyen (heures) |
   |---|---|---|
   | `compte` | 1 | 1,76 (≈ 1 h 46 min) |

5. **Valeurs nulles/exclusions** : aucune ligne exclue dans les faits
   (voir point 2) — la population théorique et la population réelle
   coïncident ici uniquement parce que le seul ticket existant est
   déjà résolu.
6. **Limites** : **n=1** — une seule mesure de délai ne permet
   strictement aucune moyenne significative ni comparaison entre
   catégories (les 6 autres catégories n'ont aucun ticket résolu à
   mesurer). Rappel terminologique respecté : ce chiffre est un
   **délai total création→résolution**, pas un temps de traitement
   agent — aucune donnée ne permet de faire cette seconde mesure sur
   ce projet aujourd'hui.
7. **Requête exécutée** :
   ```sql
   SELECT categorie, COUNT(*) AS nb_resolus,
          AVG(EXTRACT(EPOCH FROM (resolu_le - cree_le))/3600) AS delai_total_moyen_heures
   FROM support_tickets
   WHERE institution_id IS NOT NULL AND resolu_le IS NOT NULL
   GROUP BY categorie
   ORDER BY delai_total_moyen_heures DESC;
   ```

### Q3 — Volume et motifs des signalements bidirectionnels

1. **Période exacte analysée** : aucune borne de date dans la requête
   (`WHERE type_signaleur IS NOT NULL` uniquement) — couvre tout
   l'historique depuis la capacité bidirectionnelle (15/08/2026)
   jusqu'à la date d'exécution.
2. **Population exacte** : toutes les lignes `signalements` où
   `type_signaleur IS NOT NULL` (exclut structurellement les
   signalements "Communauté", confirmé 8.8).
3. **Nombre total d'enregistrements** : **4**.
4. **Résultat brut, les deux sens strictement séparés (jamais
   mélangés, conformément à la consigne)** :

   **Déposés par un citoyen contre l'institution** (`type_signaleur = citoyen`) :

   | Motif | Statut | Nombre |
   |---|---|---|
   | `arnaque_fraude` | `nouveau` | 1 |
   | `rdv_non_honore` | `nouveau` | 1 |

   **Déposés par l'institution contre un citoyen** (`type_signaleur = institution`) :

   | Motif | Statut | Nombre |
   |---|---|---|
   | `absence_repetee` | `nouveau` | 1 |
   | `absence_repetee` | `cloture` | 1 |

   Seuls 3 motifs distincts apparaissent dans les données réelles
   (`arnaque_fraude`, `rdv_non_honore`, `absence_repetee`) — **sur les
   listes complètes `SIGNALEMENT_MOTIFS_INSTITUTION`/motifs citoyen du
   code (Domaine 6), tous les autres motifs possibles ont 0 occurrence
   dans les données actuelles**, ce n'est pas une omission de la mesure.
   **Aucun ticket dans une catégorie liée à `facturation`** — sans objet
   ici, cette requête concerne les signalements, pas le support
   (rapprochement avec l'ambiguïté Facturation en 8.4 sans objet sur
   cette requête précise).
5. **Valeurs nulles/exclusions** : aucune valeur nulle sur les champs
   sélectionnés — `motif` et `type_signaleur` sont renseignés sur les 4 lignes.
6. **Limites** : **n=4**, répartition 2/2 entre les deux sens — beaucoup
   trop faible pour établir un motif dominant dans un sens ou dans
   l'autre. Les deux occurrences `absence_repetee` (institution) sont
   à 2 statuts différents (`nouveau` et `cloture`) — cela peut
   représenter 2 signalements distincts avec le même motif, ou un
   artefact de comptage ; la requête ne permet pas de trancher sans
   lire les enregistrements individuels (hors périmètre de cette
   mesure agrégée).
7. **Requête exécutée** :
   ```sql
   SELECT type_signaleur, motif, statut, COUNT(*)
   FROM signalements
   WHERE type_signaleur IS NOT NULL
   GROUP BY type_signaleur, motif, statut
   ORDER BY type_signaleur, COUNT(*) DESC;
   ```

### Q5 — Escalade des signalements

1. **Période exacte analysée** : identique à Q3.
2. **Population exacte** : identique à Q3 (`type_signaleur IS NOT NULL`).
3. **Nombre total d'enregistrements** : **4** (cohérent avec Q3 —
   même population totale).
4. **Résultat brut** :

   | Niveau d'escalade | Nombre |
   |---|---|
   | `agent` | 4 |

   Conformément à la structure déjà vérifiée (8.8,
   `escalade_niveau NOT NULL DEFAULT 'agent'`) : les 4 signalements
   sont au niveau **agent = non-escaladé**, pas une donnée manquante.
   **0 occurrence à `superviseur` ou `admin`.**
5. **Valeurs nulles/exclusions** : aucune — `escalade_niveau` ne peut
   pas être nul par construction (contrainte `NOT NULL` en base).
6. **Limites** : **n=4**, tous au niveau par défaut — impossible de
   dire si l'escalade est "peu utilisée en général" ou simplement
   "jamais nécessaire sur ces 4 cas précis" ; le volume ne permet
   aucune des deux conclusions avec confiance.
7. **Requête exécutée** :
   ```sql
   SELECT escalade_niveau, COUNT(*)
   FROM signalements
   WHERE type_signaleur IS NOT NULL
   GROUP BY escalade_niveau
   ORDER BY escalade_niveau;
   ```

### Synthèse factuelle de l'Étape 3 (aucune priorité, conforme à la consigne)

- Support Yelen institution : **1 ticket au total** dans tout le
  système, catégorie `compte`, résolu en ≈1h46.
- Signalements bidirectionnels : **4 au total**, 2 déposés par un
  citoyen (motifs `arnaque_fraude`, `rdv_non_honore`), 2 déposés par
  l'institution (motif `absence_repetee` ×2, statuts différents).
- Escalade : **jamais utilisée** sur les 4 cas mesurés (niveau `agent`
  à 100%).
- **Catégorie `facturation` (ambiguïté Domaine 7/8, 8.4)** :
  **AMBIGUÏTÉ NON RÉSOLUE — mais pour une raison différente de celle
  anticipée.** Ce n'est pas que le contenu des tickets `facturation`
  ne permette pas de trancher : **aucun ticket n'existe dans cette
  catégorie** dans les données actuelles (Q1 : 0 ligne). L'ambiguïté
  structurelle reste donc entièrement théorique tant qu'aucun ticket
  réel n'y a été déposé — rien à examiner qualitativement pour
  l'instant (Étape 4 sans objet sur ce point précis, à revisiter
  quand/si des tickets `facturation` apparaissent).
- **Aucune priorité Help Center, aucun article, aucune catégorie,
  aucun changement produit déduit de ces chiffres** — conforme à la
  consigne. Les volumes actuels ne permettent structurellement aucune
  décision de contenu ; ils constituent un point de mesure initial,
  pas un signal exploitable en l'état.

**État : Étape 3 terminée. Arrêt ici, conformément à la consigne —
prochaine étape Phase B3 (croisement Support réel × Audit technique
des 8 domaines), sur décision de Bryan.**

---

# PHASE B3 — Croisement Support réel × Audit technique (21/09/2026)

**Limite méthodologique à poser avant toute chose** : les requêtes
exécutées en Étape 3 étaient des `COUNT(*) ... GROUP BY` — elles
donnent catégorie/motif/statut, jamais le **contenu libre réel**
(`sujet`/`contenu` du ticket support, `description` du signalement).
"Examiner le contenu réel" dans ce qui suit signifie donc : **au
niveau des champs structurés déjà mesurés** (catégorie, motif — un
motif est une valeur contrôlée, pas un texte libre, donc plus
informatif qu'une simple catégorie mais toujours pas le texte intégral
rédigé par la personne). Pour une lecture du texte libre réel, une
requête supplémentaire serait nécessaire (proposée en fin de section,
non exécutée). Cette distinction est respectée strictement ci-dessous —
**aucune inférence n'est présentée comme une lecture du texte réel
quand elle ne l'est pas**.

## B3.1 — Examen des 5 cas réels

### Cas 1 — Support Yelen institution, catégorie `compte`, résolu (≈1h46)

- **Problème réellement exprimé** : NON DISPONIBLE — seule la
  catégorie `compte` est connue ; ni le `sujet` ni le `contenu` du
  ticket n'ont été extraits par la mesure agrégée.
- **Contexte** : catégorie la plus générique des 7 (`compte`,
  `facturation`, `client`, `technique`, `partenariat`, `securite`,
  `autre`) — recouvre potentiellement plusieurs domaines distincts du
  Corpus A sans plus de précision.
- **Domaine/module Yelen** : candidats **non confirmés** (aucun ne
  peut être retenu sans le contenu réel) — Domaine 1 (Sécurité du
  compte, Administration & accès, Profil), Domaine 5 (Équipe & Accès).
  Traité comme une liste de candidats, pas une correspondance.
- **Réponse actuelle donnée** : résolu par un agent humain via Support
  Yelen (Domaine 4, module 4), délai total ≈1h46 (Q2).
- **Besoin d'explication éventuel** : NON DÉTERMINABLE sans contenu réel.
- **Problème UX éventuel** : NON DÉTERMINABLE sans contenu réel.
- **Connaissance existante correspondante** : **corrélation possible,
  non prouvée** — la catégorie `compte` recoupe l'espace où vivent T1/T2
  (Domaine 1, confusions Profil Entreprise/Responsable/Administration &
  accès/Sécurité du compte) et T3 (réauthentification). **Aucune de ces
  correspondances n'est confirmée** — un seul ticket générique ne
  suffit pas à valider qu'un prestataire a réellement buté sur l'une de
  ces confusions précises.

### Cas 2 — Signalement citoyen→institution, motif `arnaque_fraude`, statut `nouveau`

- **Problème réellement exprimé (niveau motif structuré)** : un
  citoyen accuse l'institution d'arnaque/fraude. Motif appartenant à la
  liste contrôlée citoyen (distincte de `SIGNALEMENT_MOTIFS_INSTITUTION`,
  Domaine 6) — confirmé par sa présence même dans les résultats
  (un motif qui n'existerait pas dans la liste contrôlée n'aurait pas pu
  être inséré, contrainte déjà documentée Domaine 6).
- **Contexte** : dossier de case management (Domaine 6), toujours au
  statut initial `nouveau` — n'a pas encore été traité au moment de la
  mesure (`SIGNALEMENT_TRANSITIONS.nouveau = ["a_traiter","rejete","doublon"]`).
- **Domaine/module Yelen** : Domaine 6 (Signalements), directement —
  seule correspondance non ambiguë de ce corpus.
- **Réponse actuelle donnée** : aucune encore (statut `nouveau`).
- **Besoin d'explication éventuel** : rejoint le moment d'aide déjà
  identifié Domaine 6 ("institution reçoit un signalement 'Contre
  vous' pour la première fois... aucune explication du processus qui
  suit") — **ce cas réel confirme que la situation décrite dans ce
  moment d'aide se produit effectivement**, pas seulement en théorie.
- **Problème UX éventuel** : aucun nouveau.
- **Connaissance existante correspondante** : confirme l'usage réel du
  badge "Contre vous"/pattern P6-adjacent (Domaine 6) — **la
  bidirectionnalité des signalements, audités comme fonctionnalité
  réelle au Domaine 6, est ici observée en usage réel**, pas seulement
  dans le code.

### Cas 3 — Signalement citoyen→institution, motif `rdv_non_honore`, statut `nouveau`

- **Problème réellement exprimé (niveau motif structuré)** : un citoyen
  signale que son rendez-vous n'a pas été honoré par l'institution.
- **Contexte** : dossier de case management, statut `nouveau`, non traité.
- **Domaine/module Yelen** : à l'intersection de Domaine 2 (RDV —
  statuts, présence, "Absent"/`en_retard`) et Domaine 6 (Signalements,
  le canal utilisé pour l'exprimer).
- **Réponse actuelle donnée** : aucune encore.
- **Besoin d'explication éventuel** : NON DÉTERMINABLE avec un seul cas
  — pourrait révéler un besoin ("que faire si mon RDV n'a pas été
  honoré par l'institution, en tant que citoyen") mais rien dans le
  Corpus A (côté institution, hors périmètre citoyen de ce chantier)
  ne couvre ce parcours précisément.
- **Problème UX éventuel** : aucun nouveau identifiable à ce niveau.
- **Connaissance existante correspondante** : aucune correspondance
  directe P/T/UX/M trouvée — relie deux domaines déjà audités (2 et 6)
  sans qu'aucun des deux registres n'ait anticipé ce croisement
  précis. **Observation notée, aucune nouvelle entrée créée**
  (conforme à la consigne B3.2).

### Cas 4 et 5 — Signalements institution→citoyen, motif `absence_repetee` (×2, statuts `nouveau` et `cloture`)

- **Problème réellement exprimé (niveau motif structuré)** : l'institution
  signale un citoyen pour absences répétées (no-show récurrent).
- **Contexte** : 2 dossiers distincts au même motif — l'un encore
  `nouveau`, l'autre déjà `cloture` (a traversé tout le cycle
  `SIGNALEMENT_TRANSITIONS` au moins une fois : `nouveau`→...→`resolu`→`cloture`).
  **C'est la seule preuve, dans tout ce corpus, qu'un dossier de case
  management a été mené jusqu'à son terme réel en production** — pas
  seulement vérifié dans le code.
- **Domaine/module Yelen** : Domaine 2 (RDV — "Absent"/`presence_status`,
  le comportement client mesuré) et Domaine 6 (Signalements, le canal).
- **Réponse actuelle donnée** : 1 dossier traité jusqu'à clôture, 1
  encore en attente.
- **Besoin d'explication éventuel** : NON DÉTERMINABLE avec 2 cas.
- **Problème UX éventuel** : aucun nouveau identifiable.
- **Connaissance existante correspondante** : confirme l'usage réel du
  sens "déposé par vous" (Domaine 6) — l'institution utilise
  effectivement ce mécanisme pour signaler des absences répétées,
  cohérent avec le motif institutionnel prévu par le modèle de données
  (Domaine 6, `SIGNALEMENT_MOTIFS_INSTITUTION`).

## B3.2 — Synthèse des correspondances avec les registres (aucune nouvelle entrée créée)

| Cas | Domaine(s) Phase A | Registre correspondant | Statut de la correspondance |
|---|---|---|---|
| 1 (support, `compte`) | Domaine 1 et/ou 5 (candidats) | T1, T2, T3 (Domaine 1) | **Corrélation possible, non prouvée** — contenu réel manquant |
| 2 (signalement, `arnaque_fraude`, citoyen→institution) | Domaine 6 | Moment d'aide (M) déjà identifié Domaine 6 ("1er signalement 'Contre vous'") | **Confirmé en usage réel** |
| 3 (signalement, `rdv_non_honore`, citoyen→institution) | Domaine 2 + Domaine 6 | Aucune entrée existante ne couvre ce croisement précis | **Aucune correspondance — observation notée seulement** |
| 4/5 (signalement, `absence_repetee` ×2, institution→citoyen) | Domaine 2 + Domaine 6 | Pattern bidirectionnel audité Domaine 6 (badge "Déposé par vous") | **Confirmé en usage réel, y compris cycle complet jusqu'à clôture** |
| Escalade (0/4 escaladés) | Domaine 6 | À VÉRIFIER Domaine 6 ("fréquence réelle d'usage de l'escalade") | **Partiellement informé** — sur ces 4 cas précis, jamais utilisée ; **ne clôt pas** le point À VÉRIFIER (n=4 insuffisant pour conclure sur le mécanisme en général) |

**Aucune nouvelle entrée P/T/UX/M créée**, conformément à la consigne —
les correspondances confirmées renforcent des constats déjà faits en
Phase A (la bidirectionnalité des signalements est réellement utilisée),
elles n'ajoutent pas une connaissance nouvelle au registre.

## B3.3 — Signalements traités comme système de case management (pas comme des tickets)

Les 4 cas ne sont **pas** analysés comme 4 demandes isolées mais comme
2 paires directionnelles d'un même système déjà audité (Domaine 6) :

- **Citoyen → institution** (2 cas, tous deux `nouveau`) :
  `arnaque_fraude`, `rdv_non_honore`. Aucun n'a encore été traité au
  moment de la mesure — le corpus ne permet donc **aucune observation
  du délai réel de traitement** de ce sens (le point À VÉRIFIER
  Domaine 6 sur le délai reste entier, pas informé par cette mesure).
- **Institution → citoyen** (2 cas, `absence_repetee` sur les deux,
  statuts `nouveau` et `cloture`) : **le seul sens où un cycle complet
  a été observé** — confirme que la machine à états (T12, Domaine 6)
  fonctionne bout en bout en production, pas seulement dans le code.
- **Aucun des 4 motifs observés ne sort de la liste contrôlée déjà
  auditée** (Domaine 6) — pas de motif inattendu, pas de valeur libre.
- **Parcours déjà identifiés aux Domaines 1-8 auxquels ces motifs se
  rattachent** : `absence_repetee` et `rdv_non_honore` se rattachent
  tous deux, par le sens, au suivi de présence/RDV (Domaine 2 —
  `presence_status`, statut `absent`) sans qu'aucun gap ou moment
  d'aide de ce domaine ne les ait anticipés précisément sous cet angle
  (un citoyen/une institution utilisant le canal Signalements plutôt
  que le canal RDV lui-même pour exprimer ce problème).

## B3.4 — Ambiguïté facturation

**Ambiguïté non testable avec les données actuelles — 0 ticket
observé.** Aucune tentative de résolution n'est faite. Reste consignée
en 8.4/8.10 telle quelle, à réexaminer uniquement si des tickets
`facturation` apparaissent dans une mesure future.

## B3.5 — Ce que B3 confirme et ne confirme pas (aucune priorisation)

**Ce que les données réelles confirment** :
- Le mécanisme bidirectionnel de Signalements (Domaine 6) est
  réellement utilisé dans les deux sens, pas seulement construit.
- Un cycle complet de case management (nouveau→...→clôture) a été mené
  à terme au moins une fois en production.
- L'escalade n'a été déclenchée sur aucun des 4 cas observés.
- Le canal Support Yelen institution a traité un ticket réel (catégorie
  `compte`) en un délai total de 1h46.
- Aucun ticket support dans la catégorie `facturation` à ce jour.

**Ce que les données réelles NE confirment PAS** :
- Aucune catégorie de support dominante (n=1, une seule catégorie
  représentée sur 7 possibles).
- Aucun délai de référence pour aucune catégorie (n=1).
- Aucune fréquence réelle d'usage de l'escalade en général (n=4, tous
  identiques).
- Aucune des correspondances T1/T2/T3 (Cas 1) — contenu réel manquant.
- Aucune confirmation ou infirmation de l'ambiguïté facturation (0 cas).
- Aucun signal de priorité, aucun classement, aucune tendance.

**Aucun Top 10, score, priorité V1, classement ou recommandation
d'article produit à ce stade.**

## B3.6 — LIMITES DU CORPUS SUPPORT ACTUEL

- **Volume extrêmement faible** : 1 ticket support, 4 signalements —
  très en dessous de tout seuil permettant une lecture statistique.
- **Absence de série historique suffisante** : les deux sources n'ont
  que quelques semaines d'existence (06/09 et 15/08/2026) au moment de
  la mesure — aucune saisonnalité, aucune tendance dans le temps observable.
- **Impossible de conclure sur la fréquence réelle des problèmes** :
  un seul ticket dans une seule catégorie ne permet pas de dire si les
  6 autres catégories sont réellement sans besoin, ou simplement pas
  encore sollicitées à cette échelle de volume.
- **Impossible de comparer les catégories entre elles** : 1 seule
  catégorie représentée, aucune comparaison possible par construction.
- **Impossible d'utiliser le délai n=1 (≈1h46) comme référence** —
  ni bon ni mauvais signal, juste un point isolé.
- **Impossible de trancher l'ambiguïté facturation** faute de tout ticket.
- **Contenu textuel réel non examiné** — seules les valeurs structurées
  (catégorie, motif, statut) ont été mesurées ; `sujet`/`contenu`/
  `description` restent non consultés dans cette phase (requête
  candidate ci-dessous si utile plus tard).
- **Ce que cela signifie pour le chantier** (constat produit, pas un
  échec de méthode) : construire un Help Center aujourd'hui reviendrait
  à le construire **sans connaissance statistique réelle des besoins
  prestataires** — argument direct pour ne pas figer une architecture
  de contenu sur la base de ce corpus, et pour prévoir, dans la future
  conception (Phase D), un mécanisme permanent de remontée des besoins
  depuis le Support (un agent qui signale qu'un ticket révèle un besoin
  de contenu) — **la forme exacte de ce mécanisme n'est pas conçue ici**,
  seulement son utilité déjà constatée.

### Requête candidate pour une future lecture de contenu réel (non exécutée)

Si un examen qualitatif plus profond devient utile plus tard (volume
suffisant) :

```sql
-- Contenu réel des tickets support institution (texte libre)
SELECT id, numero_public, categorie, statut, sujet, cree_le, resolu_le
FROM support_tickets
WHERE institution_id IS NOT NULL
ORDER BY cree_le;

-- Description réelle des signalements bidirectionnels
SELECT id, type_signaleur, motif, statut, description, created_at
FROM signalements
WHERE type_signaleur IS NOT NULL
ORDER BY created_at;
```

---

**ARRÊT — Phase B3 restituée, en attente de validation.** Aucune
Phase C (priorisation) ne démarre avant validation explicite de Bryan.

---

# PHASE C — Matrice de décision (21/09/2026)

**Objectif rappelé** : déterminer, pour chaque besoin réellement
démontré ou fortement justifié par les Phases A/B, **quelle forme de
réponse** Yelen devrait éventuellement fournir — pas encore construire
cette réponse. **Aucun contenu final, aucun article rédigé, aucun
écran, aucun CMS, aucun classement global de priorité** ci-dessous.

## Note de notation — éviter la collision P (pattern) / P (preuve)

Bryan a proposé une échelle de preuve P1-P4. Comme le registre de
patterns UX (Phase A) utilise déjà la même lettre (**P1 à P16**), les
deux se retrouveraient visuellement confondus dans une même ligne de
matrice (ex. "P15" le pattern et "P2" le niveau de preuve, côte à
côte). Pour lever toute ambiguïté, ce document utilise **PR1 à PR4**
pour la preuve, en gardant **P1-P16** exclusivement pour les patterns
UX déjà enregistrés :

- **PR1** — démontré par le code (Phase A uniquement, aucune donnée
  réelle ni cas observé).
- **PR2** — observé dans les données réelles agrégées (Phase B2,
  comptages), sans lecture de cas individuel.
- **PR3** — confirmé par un cas réel suffisamment détaillé pour être
  interprété (Phase B3, cas individuel examiné).
- **PR4** — hypothèse ou besoin à vérifier, sans preuve directe.

**Rappel explicite valable pour toute la matrice** : le volume du
corpus support (1 ticket, 4 signalements) est **trop faible pour
établir une fréquence représentative** — la fréquence observée est une
donnée descriptive, jamais une priorité produit. Cette limite est
attachée à chaque ligne qui s'appuie sur B2/B3, pas seulement rappelée
une fois en préambule.

## C.1 — Connaissances transverses (registre T)

### T1 — Profil Entreprise / Profil Responsable / Administration & accès

- **Preuve** : PR1.
- **Contexte** : 3 écrans distincts, noms proches, aucun ne référence
  les 2 autres (Domaine 1).
- **Domaine** : 1.
- **Réponse existante** : aucune — chaque écran a son propre sous-titre
  isolé.
- **Nature du problème** : connaissance transverse (repère de
  navigation manquant), pas un blocage.
- **Forme d'aide potentielle** :
  - **B (connaissance transverse)** — nécessaire, la confusion
    traverse 3 écrans.
  - **A (aide interface)** en complément — un rappel court sur chacun
    des 3 écrans ("Vous cherchez plutôt X ?"), pas un article isolé
    qui ne serait jamais trouvé sans lien.
- **Pattern réutilisable** : aucun pattern P direct, mais le principe
  déjà pratiqué sur Facturation Yelen (P16 — expliciter sa propre
  distinction dans le texte de l'écran) est directement transposable ici.
- **Données manquantes** : aucune preuve réelle (PR2/PR3) qu'un
  prestataire confond effectivement les 3 écrans — corrélation évoquée
  avec le Cas 1 du corpus support (catégorie `compte`), **non prouvée**.
- **Décision à prendre** : combiner une connaissance transverse courte
  + rappels contextuels sur les 3 écrans ; où exactement vivra cette
  connaissance (Phase D).

### T2 — Sécurité du compte / Administration & accès

- **Preuve** : PR1.
- **Contexte** : même famille que T1 — écran institution-wide (admin)
  vs écran personnel (5 rôles), noms proches.
- **Domaine** : 1.
- **Réponse existante** : PARTIEL — `ProfilTab.tsx` a déjà un lien
  "Ouvrir" vers `parametres-securite` pour l'admin, sans explication du
  pourquoi de 2 écrans.
- **Nature du problème** : connaissance transverse + micro-manque UX
  (le lien existe, l'explication non).
- **Forme d'aide potentielle** : B en priorité, A en complément (une
  ligne sur le lien déjà câblé).
- **Pattern réutilisable** : le lien de renvoi déjà existant est un bon
  point d'ancrage pour une future info courte.
- **Données manquantes** : aucune.
- **Décision à prendre** : à traiter avec T1 dans la même connaissance
  transverse (Phase D), pas séparément.

### T3 — Réauthentification (`REAUTH_REQUIRED`)

- **Preuve** : PR1.
- **Contexte** : `ReauthModal` déclenché sur ≥3 actions sensibles
  (Sécurité du compte, suppression de compte, ajout passkey) sans
  jamais expliquer pourquoi.
- **Domaine** : 1 (transverse).
- **Réponse existante** : NON DÉTERMINÉ — contenu exact du modal non
  vérifié en détail (À VÉRIFIER pré-existant, Domaine 1).
- **Nature du problème** : manque d'explication contextuelle **au bon
  endroit déjà identifié** — cas d'école pour une aide directement dans
  l'interface.
- **Forme d'aide potentielle** : **A en priorité** — `ReauthModal` est
  un composant **partagé**, une seule modification couvre toutes les
  occurrences. B/C non nécessaires si A suffit.
- **Pattern réutilisable** : **P15 directement applicable** (règle +
  raison + marche à suivre, déjà le meilleur exemple de blocage
  expliqué de tout l'audit, Domaine 7/Paiements) — même logique
  transposable ici : "Yelen redemande votre identité parce que [raison],
  cela ne prendra qu'un instant."
- **Données manquantes** : contenu actuel exact du modal (À VÉRIFIER).
- **Décision à prendre** : candidat à faible coût et fort effet
  (composant unique) — bon candidat pour un premier lot, sans figer de
  priorité globale sur le reste de la matrice.

### T5 — Horaires publics vs créneaux réservables

- **Preuve** : PR1.
- **Contexte** : dette technique documentée dans le code des deux
  écrans eux-mêmes (Domaine 1 + 2).
- **Domaine** : 1, 2.
- **Réponse existante** : **PARTIEL, déjà largement couvert** —
  `ProfilEntrepriseTab` a déjà une note bleue explicative ("Ces
  horaires déterminent le badge Ouvert/Fermé... distincts des créneaux
  de rendez-vous").
- **Nature du problème** : probablement déjà résolu d'un côté — reste
  à confirmer la réciproque sur `DisponibilitesTab`.
- **Forme d'aide potentielle** : **A uniquement** (compléter la note
  réciproque si absente) — cas où généraliser un pattern déjà écrit
  suffit, aucune connaissance B/article C nécessaire.
- **Pattern réutilisable** : la note contextuelle bleue déjà utilisée
  sur Profil Entreprise, à dupliquer sur Disponibilités si absente.
- **Données manquantes** : confirmation que `DisponibilitesTab` n'a
  pas déjà cette note (Domaine 2 ne le précise pas explicitement).
- **Décision à prendre** : vérifier l'écran avant d'investir — c'est
  probablement le cas le plus proche d'être déjà résolu de toute la
  matrice.

### T9 — Canaux de communication citoyen↔institution

- **Preuve** : PR1.
- **Contexte** : 4 canaux (Questions clients, Messagerie, Avis,
  Signalements) aux règles de visibilité différentes, jamais comparés
  entre eux (Domaine 4, enrichie Domaine 6).
- **Domaine** : 4, 6.
- **Réponse existante** : chaque écran individuel explique bien SA
  propre règle (Questions clients répète 2 fois son caractère public) —
  aucune vue d'ensemble comparative n'existe.
- **Nature du problème** : connaissance transverse pure — question
  ponctuelle probablement posée une fois, pas un blocage répété.
- **Forme d'aide potentielle** : **B/C** — l'information vit
  naturellement au-dessus des 4 écrans, pas sur l'un d'eux en
  particulier. Bon candidat article comparatif si le format long se
  justifie.
- **Pattern réutilisable** : aucun — cas où une vraie construction de
  connaissance est probablement nécessaire plutôt qu'une généralisation.
- **Données manquantes** : toute preuve réelle (PR2/PR3) qu'un
  prestataire confond ces canaux — actuellement PR1 seul.
- **Décision à prendre** : candidat pour un premier article/connaissance
  si le corpus support futur confirme une confusion réelle — pas
  urgent sur la seule base du code.

### T10 — 3 systèmes "QR" distincts

- **Preuve** : PR1.
- **Contexte** : QR public institution, scan de présence, badge QR
  accueil membre — aucun rapport fonctionnel (Domaine 2, 5).
- **Domaine** : 2, 5.
- **Réponse existante** : chaque écran nomme correctement sa propre
  fonction, aucun n'induit activement en erreur.
- **Nature du problème** : connaissance transverse, risque faible à
  modéré (écrans rencontrés à des moments différents du parcours).
- **Forme d'aide potentielle** : B, mais **basse priorité tant
  qu'aucune preuve PR2/PR3** ne confirme une confusion réelle.
- **Pattern réutilisable** : aucun.
- **Données manquantes** : toute preuve réelle.
- **Décision à prendre** : garder en réserve, pas une priorité immédiate.

### T11 — 2 formules de score internes (risque journal / réputation avis)

- **Preuve** : PR1.
- **Contexte** : 2 scores calculés jamais vulgarisés en langage produit
  (Domaine 4, 5).
- **Domaine** : 4, 5.
- **Réponse existante** : aucune vulgarisation sur aucun des deux écrans.
- **Nature du problème** : connaissance transverse — possiblement 2
  connaissances séparées (usages/publics différents : sécurité interne
  vs qualité commerciale) plutôt qu'une seule, à trancher en Phase D.
- **Forme d'aide potentielle** : **A** probable pour chacun (une ligne
  d'explication directement sous le score affiché) plutôt qu'un
  article séparé — les formules ne semblent pas assez complexes pour
  justifier un format long.
- **Pattern réutilisable** : principe du pattern P9 (état vide expliqué
  avec contexte) transposable à une "explication de score" cohérente.
- **Données manquantes** : aucune.
- **Décision à prendre** : privilégier une explication courte in-situ
  sur chacun des 2 écrans plutôt qu'un contenu séparé, à valider Phase D.

### T12 — Machines à états légales non expliquées (Signalements / Documents clients / Support)

- **Preuve** : **PR3** (cas réel B3 : le cycle `nouveau`→`cloture`
  observé sur le Cas 4/5 confirme que ce mécanisme fonctionne
  réellement en production, pas seulement dans le code).
- **Contexte** : 3 systèmes avec transitions strictes, jamais
  expliquées au prestataire (Domaine 2, 4, 6).
- **Domaine** : 2, 4, 6.
- **Réponse existante** : chaque écran affiche déjà des badges de
  statut clairs (bonne UX locale) — aucun n'explique "que faire
  ensuite" selon le statut affiché.
- **Nature du problème** : connaissance transverse, avec une piste de
  généralisation concrète déjà disponible.
- **Forme d'aide potentielle** : **A en priorité** — le champ
  "prochaine étape" (déjà utilisé sur Communauté Pro/Partenariat)
  transposable directement aux 3 systèmes de statuts : chaque fiche
  affiche sa propre "prochaine étape possible", pas besoin d'un article
  expliquant tout le graphe. B en complément si une vue comparative des
  3 systèmes est jugée utile plus tard.
- **Pattern réutilisable** : **P8 directement applicable** (champ
  "prochaine étape" contextualisé par rôle/statut, Communauté Pro).
- **Données manquantes** : aucune pour la mise en œuvre technique ;
  confirmation de la friction réelle viendrait d'un futur volume de
  tickets sur ces 3 écrans.
- **Décision à prendre** : bon candidat pour généraliser P8 plutôt que
  produire du contenu nouveau — niveau de preuve le plus solide de
  cette section (PR3).

## C.2 — Problèmes UX à corriger (registre UX)

### UX1 (ex-T4) — Documents ← Profil Entreprise, lien croisé manquant

- **Preuve** : PR1. **Domaine** : 1.
- **Nature** : problème UX pur, pas un manque de documentation.
- **Forme d'aide potentielle** : **D uniquement** — lien direct depuis
  l'écran Documents bloqué vers Profil Entreprise. Aucun contenu d'aide
  ne remplace ce lien manquant.
- **Décision à prendre** : correction UX recommandée en priorité sur
  toute solution documentaire.

### UX2 (ex-T6) — Paires d'actions au nom proche

- **Preuve** : PR1. **Domaine** : 2, 3.
- **Nature** : problème UX (convention de nommage absente).
- **Forme d'aide potentielle** : **D en priorité** (revoir la
  convention de nommage globale) ; **A en solution transitoire**
  (courte info au clic sur chaque bouton) si D n'est pas fait tout de
  suite.
- **Décision à prendre** : la vraie décision est produit/design, pas
  documentaire — le Help Center ne doit pas être le pansement d'un
  nommage à corriger.

### UX3 (ex-T7) — Mes Offres disparaît de la navigation

- **Preuve** : PR1. **Domaine** : 3.
- **Nature** : problème UX.
- **Forme d'aide potentielle** : **D uniquement** — indice visuel dans
  la nav (onglet visible mais verrouillé avec explication) plutôt
  qu'une disparition totale.
- **Décision à prendre** : correction UX recommandée, aucun contenu
  d'aide à produire tant que l'interface peut résoudre le problème
  elle-même.

### UX4 (ex-T8) — Planification incohérente entre 2 écrans

- **Preuve** : PR1, explicitement non confirmé comme friction réelle.
- **Domaine** : 3, 4.
- **Forme d'aide potentielle** : **aucune action recommandée à ce
  stade** — ni D ni contenu, en l'absence de preuve PR2/PR3.
- **Décision à prendre** : rester en veille.

### UX5 — `yelen-support` sans rendu

- **Preuve** : PR1 (bug confirmé par lecture directe du code).
- **Domaine** : 8.
- **Nature** : problème technique pur — **pas un besoin de
  documentation**.
- **Forme d'aide potentielle** : **D uniquement** — aucune forme
  d'aide (A/B/C) ne peut compenser un écran qui ne rend rien.
- **Décision à prendre** : correction technique indépendante de tout
  travail Help Center — hors périmètre de ce chantier, à signaler
  comme un bug produit classique.

## C.3 — Besoins révélés par le corpus support réel (Phase B3)

### B3-1 — Premier signalement "Contre vous" reçu par une institution

- **Preuve** : **PR3** (Cas 2, confirmé réel) — le niveau de preuve le
  plus élevé accordé à un besoin de ce chantier.
- **Contexte/domaine** : 6.
- **Réponse existante** : badge "Contre vous" déjà clair, mais aucune
  explication du processus qui suit.
- **Nature du problème** : manque d'explication contextuelle au moment
  précis où l'événement se produit.
- **Forme d'aide potentielle** : **A en priorité** — message
  contextuel déclenché par l'événement (premier signalement reçu),
  pas au premier accès de l'écran.
- **Pattern réutilisable** : **P5 (`MesOffresIntro`, onboarding
  contextuel réouvrable) transposable** — même mécanique, déclenchée
  par un événement plutôt qu'un premier accès d'écran.
- **Données manquantes** : le délai réel de traitement (72h cité dans
  l'ancien guide retiré, **jamais reconfirmé**) — à vérifier avant
  d'écrire quoi que ce soit qui le citerait.
- **Décision à prendre** : candidat le mieux fondé de toute la matrice
  pour un premier lot d'implantation (Phase E) — sous réserve
  explicite de vérifier le délai avant rédaction, jamais le réutiliser
  tel quel depuis l'ancien guide.

### B3-2 — Croisement présence RDV × signalement (Cas 3, 4/5)

- **Preuve** : PR3 pour l'existence du croisement, **mais seulement 3
  occurrences** — volume insuffisant pour toute décision de contenu.
- **Domaine** : 2, 6.
- **Nature du problème** : croisement non couvert par le Corpus A
  actuel entre suivi de présence (Domaine 2) et signalement (Domaine 6).
- **Forme d'aide potentielle** : **à déterminer — PR4 pour toute
  action concrète.** Trop tôt pour choisir entre A/B/C avec 3 cas.
- **Décision à prendre** : noter le croisement, ne rien construire
  avant un volume plus représentatif — cohérent avec la règle de
  Bryan sur le volume insuffisant.

### B3-3 — Ambiguïté facturation (Support `facturation` — Domaine 7 vs 8)

- **Preuve** : PR4 (hypothèse pure — 0 ticket dans cette catégorie).
- **Domaine** : 7, 8.
- **Forme d'aide potentielle** : aucune — rien à construire tant
  qu'aucun ticket réel n'existe dans cette catégorie.
- **Décision à prendre** : en attente, réexaminer uniquement si des
  tickets `facturation` apparaissent dans une future mesure.

### B3-4 — Escalade des signalements jamais utilisée (0/4)

- **Preuve** : PR2 (observé, n=4 très faible).
- **Domaine** : 6.
- **Nature du problème** : indéterminable — pourrait signifier que
  l'escalade n'est jamais nécessaire (bon signe) ou qu'elle est
  sous-utilisée par méconnaissance (mauvais signe).
- **Forme d'aide potentielle** : aucune action recommandée — nécessite
  davantage de volume avant même une investigation qualitative.
- **Décision à prendre** : en observation, pas d'action.

## C.4 — Synthèse organisationnelle (regroupement, pas un classement)

**Explicitement : ceci n'est pas un ordre de priorité.** Simple
regroupement par forme d'aide recommandée, pour que Phase D parte
d'une vue organisée plutôt que d'une liste plate.

- **Corrections UX (D) recommandées, indépendantes du Help Center** :
  UX1, UX2 (en partie), UX3, UX5.
- **Aide directement dans l'interface (A), patterns déjà réutilisables** :
  T3 (P15), T5 (note existante à dupliquer), T11 (principe P9), T12
  (P8), B3-1 (P5).
- **Connaissance transverse (B) à construire, sans pattern existant à
  copier** : T1+T2 (probablement une seule connaissance combinée), T9.
- **En réserve, preuve insuffisante pour agir (PR1 seul, aucune donnée
  réelle)** : T10.
- **En observation, volume B2/B3 insuffisant pour toute décision** :
  B3-2, B3-3, B3-4, UX4.
- **Hors périmètre Help Center, à traiter comme un bug produit
  classique** : UX5.

## C.5 — Ce que Phase C confirme et ne confirme pas

**Confirme** : le produit sait déjà bien faire de l'aide contextuelle
(patterns P5/P8/P9/P15/P16 déjà réels) — la majorité des besoins
identifiés ici se résolvent en **généralisant** ces patterns, pas en
inventant un système d'aide étranger au produit. Le besoin le mieux
prouvé de toute la matrice (B3-1) a une preuve de niveau PR3, tous les
autres restent PR1/PR2/PR4.

**Ne confirme pas** : aucune fréquence réelle représentative (corpus
trop petit, rappelé explicitement à chaque ligne qui s'appuie sur
B2/B3) ; aucune priorité V1 ; aucun classement global ; aucune décision
d'architecture (où vivent les connaissances B, sous quelle forme les
articles C, etc. — Phase D).

## C.6 — Besoins de gouvernance révélés par l'audit (pas encore conçus)

Constats, pas une conception d'interface :

- **Qui identifie un nouveau besoin** : aujourd'hui, personne
  formellement — aucun mécanisme trouvé dans le code permettant à un
  agent Support de signaler qu'un ticket révèle un manque de contenu
  d'aide. Besoin réel, forme non conçue ici.
- **Comment un ticket signale un manque documentaire** : absent. Le
  ticketing Support Yelen (Domaine 4/8.1) n'a aucun champ ni action de
  ce type dans le modèle de données actuel (`support_ticket_events`,
  11 types d'événements audités Domaine 6-adjacent pour Signalements,
  aucun type "besoin de contenu signalé" nulle part).
- **Comment une connaissance sera validée** : absent. Aucune notion de
  revue/validation technique avant publication n'existe dans le
  produit actuel (cohérent avec l'absence totale de CMS/contenu Help
  Center à ce stade).
- **Comment le contenu sera révisé quand le code change** : absent —
  et **le Domaine 8 en donne un exemple concret déjà rencontré** (le
  commentaire obsolète de `layout.tsx` sur l'état de la section Yelen
  Business, Domaine 8) : le code lui-même dérive de sa propre
  documentation interne sans mécanisme de détection. Un futur Help
  Center hériterait du même risque sans un processus dédié.

**Ces 4 besoins sont notés comme réels et fondés sur l'audit — aucune
forme, interface, workflow ou outil n'est proposé ici.**

---

**ARRÊT — Phase C restituée, en attente de validation.** Aucune Phase D
(architecture) ne démarre avant validation explicite de Bryan.
