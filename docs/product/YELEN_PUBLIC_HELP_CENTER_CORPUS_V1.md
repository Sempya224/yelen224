# Yelen Public Help Center — Cartographie du Corpus V1

Document de conception, pas de contenu. **Aucun article rédigé, aucun
code modifié.** Complète `YELEN_PUBLIC_HELP_CENTER_ARCHITECTURE.md`
(spécification technique verrouillée) en instruisant la question
suivante : **quelles connaissances produit réelles justifient un
article, dans quelle catégorie, avec quel niveau de preuve ?**

**Méthode** : chaque ligne de ce document s'appuie exclusivement sur
`YELEN_PROVIDER_HELP_CENTER_AUDIT.md` (Phases A/B/C, code lu et cité) et
sur les livraisons in-product déjà faites (T5, T11-A, T11-B, vertical
slice Signalements — mémoire du chantier). Aucune fonctionnalité
supposée. Toute case marquée **informations manquantes** signale un
point "À VÉRIFIER" de l'audit — ne jamais combler par une valeur
inventée au moment de la rédaction.

**Catégories** : les 8 catégories verrouillées dans
`YELEN_PUBLIC_HELP_CENTER_ARCHITECTURE.md` §2/§11.2 (`lib/helpCenter/data.ts::CATEGORIES`).

**Statut** : cartographie complète, en attente de validation Bryan.
Aucun article ne doit être rédigé avant cette validation.

---

## 1. Commencer avec Yelen (fourchette V1 : 3-5)

| # | Fonctionnalité réelle | Écran/route | Rôle(s) | Question utilisateur plausible | Article candidat | Preuves code | Statut |
|---|---|---|---|---|---|---|---|
| 1.1 | Parcours d'inscription en 6 étapes (Intro→Téléphone/OTP→Activité→Responsable→Récapitulatif→Vérification→Succès) | `app/institution/inscription/engine/*` ↔ `api/institution/auth/verify-otp` | Futur admin (pré-compte) | « Comment créer un compte pour mon établissement ? » / « Mon code ne fonctionne pas » | **Comment créer un compte établissement sur Yelen ?** | `VerificationStep.tsx::humanizeVerifyError()` (LOCKED/INVALID_CODE) ; Audit §1.3 | Suffisamment vérifiable (étapes + erreurs OTP) — ne jamais citer de délai de validation (voir 1.2) |
| 1.2 | Cycle de vie du statut institution (`en_attente`→`validee`/`refusee`) | Accueil (`layout.tsx`, empty states par statut) | Admin | « Pourquoi mon compte est en attente / a été refusé ? » | **Pourquoi mon compte est-il en attente de validation ou a-t-il été refusé ?** | Empty states P1 (Domaine 2, dérivés du même statut) ; CLAUDE.md `/enums` | Informations manquantes — motif de refus concret et canal de recours non confirmés (À VÉRIFIER), ne pas inventer de délai (l'ancien guide citait "72h", jamais reconfirmé) |
| 1.3 | Centre de configuration (Setup Center) — remplace Accueil tant que 6 groupes ne sont pas complets | `configuration-status`, `CentreConfigurationTab.tsx`, `lib/institutionConfigProgress.ts` | Tous rôles authentifiés | « Pourquoi je vois un écran de configuration au lieu de mon tableau de bord ? » | **Pourquoi mon tableau de bord affiche-t-il un centre de configuration au lieu de l'accueil ?** | Audit Domaine 1 module 1, 6 groupes confirmés dans le code | Suffisamment vérifiable |
| 1.4 | Suspension de compte structurée (motif/référence/échéance + demande de révision) | `CompteSuspenduScreen.tsx`, `institution_suspensions`/`_revisions` | Tous | « Pourquoi mon compte est suspendu ? Comment contester ? » | **Mon compte est suspendu — que faire et comment demander une révision ?** | Audit §1.5, migrations 17/08/2026 | Suffisamment vérifiable |
| 1.5 | Yelen Security Activation — blocage du dashboard 24h après la 1ère connexion tant qu'aucun MFA n'est activé | Mécanisme transverse, `evaluerActivationSecurite()` | Tous | « Pourquoi mon tableau de bord est bloqué 24h après ma première connexion ? » | **Pourquoi dois-je activer une double authentification 24h après ma première connexion ?** | Audit §1.1, chantier 16/09/2026 | Suffisamment vérifiable (mécanisme confirmé) — texte produit exact affiché non relu, à vérifier avant rédaction finale |

---

## 2. Accueil & configuration (fourchette V1 : 3-5)

| # | Fonctionnalité réelle | Écran/route | Rôle(s) | Question utilisateur plausible | Article candidat | Preuves code | Statut |
|---|---|---|---|---|---|---|---|
| 2.1 | 4 écrans aux noms proches, périmètres différents (public / interne / identité de connexion / sécurité institution-wide) | `ProfilEntrepriseTab.tsx`, `ProfilResponsableTab.tsx`, `ProfilTab.tsx`, `SecuriteCompteTab.tsx` | Admin (les 4), dirigeant (lecture sur 2) | « Quelle différence entre Profil Entreprise, Profil Responsable, Administration & accès et Sécurité du compte ? » | **Profil Entreprise, Profil Responsable, Administration & accès, Sécurité du compte : quelle différence ?** | Audit Domaine 1 modules 2/5/8/11 ; registre T1/T2 ; mémoire chantier (T1+T2-A validé sur le principe, pas encore rédigé) | Suffisamment vérifiable |
| 2.2 | Statut juridique + activité obligatoires pour débloquer l'écran Documents ; verrouillage une fois des documents reçus | `ProfilEntrepriseTab.tsx` (TaxoModal), `DocumentsTab.tsx` | Admin | « Pourquoi je ne peux pas accéder à Documents ? » / « Pourquoi mon statut juridique est verrouillé ? » | **Pourquoi dois-je renseigner mon statut juridique avant de soumettre mes documents ?** | Audit Domaine 1 modules 2/6, bandeau bloquant `docsLocked` | Informations manquantes — délai réel de traitement des documents non confirmé (ne jamais reprendre "72h"), liste exacte des documents requis par statut (`getRequiredDocuments`) non lue en détail |
| 2.3 | Horaires publics (badge Ouvert/Fermé) distincts des créneaux de RDV réservables | `ProfilEntrepriseTab.tsx` (horaires publics), `DisponibilitesTab.tsx` | Admin/superviseur | « Pourquoi mes horaires diffèrent entre Profil Entreprise et Disponibilités ? » | **Quelle est la différence entre mes horaires publics et mes créneaux de rendez-vous réservables ?** | Registre T5 ; note contextuelle déjà livrée in-product sur les 2 écrans (21/09/2026) | Suffisamment vérifiable — conversion d'un contenu déjà vérifié, jamais une copie telle quelle (principe 9) |
| 2.4 | Réauthentification (`REAUTH_REQUIRED`) sur ≥3 actions sensibles | `SecuriteCompteTab.tsx`, suppression de compte (`ParametresTab.tsx`), ajout passkey — `ReauthModal.tsx` | Admin | « Pourquoi Yelen me redemande mon identité pour cette action ? » | **Pourquoi Yelen me redemande de confirmer mon identité pour certaines actions ?** | Registre T3 ; pattern P15 déjà appliqué dans `ReauthModal` | Suffisamment vérifiable — Phase C a déjà tranché qu'une aide contextuelle in-modal suffit ; priorité basse pour un article public séparé (voir §9) |
| 2.5 | Suppression de compte : flux 3 étapes, demande différée 30 jours, réversible en se reconnectant | `ParametresTab.tsx` (`ParametresDangerZone`) | Admin | « Que se passe-t-il si je supprime mon compte ? Puis-je annuler ? » | **Que se passe-t-il si je supprime mon compte établissement, et puis-je revenir en arrière ?** | Audit Domaine 1 module 7, `/api/institution/auth/deletion/request` | Suffisamment vérifiable — déjà bien expliqué in-product, bon candidat public pour un prospect qui hésite avant inscription |

---

## 3. RDV & clients (fourchette V1 : 3-5)

| # | Fonctionnalité réelle | Écran/route | Rôle(s) | Question utilisateur plausible | Article candidat | Preuves code | Statut |
|---|---|---|---|---|---|---|---|
| 3.1 | 2 actions distinctes sur un RDV payant : remise en attente vs annulation définitive | `ValiderRdvTab.tsx` | Admin/agent/superviseur | « Quelle différence entre Annuler la validation et Annuler la réservation ? » | **Quelle est la différence entre « Annuler la validation » et « Annuler la réservation » d'un rendez-vous payant ?** | Registre T6 | Suffisamment vérifiable |
| 3.2 | 7 statuts réels d'un document demandé à un client, transitions légales en code | `DocumentsClientsTab.tsx` | Admin/superviseur (comptable retiré 16/09) | « Que signifie ce statut, que dois-je faire ensuite ? » | **Que signifient les statuts d'un document demandé à un client (reçu, à vérifier, validé...) ?** | Registre T12 ; `lib/citoyenDocumentsConstants.ts`, `DOCUMENT_TRANSITIONS` | Informations manquantes — seuil exact du motif de refus et mécanisme de `date_limite` non confirmés (À VÉRIFIER) |
| 3.3 | `rdv` (actifs) vs `rdv-historique` (terminé/annulé/absent, lecture seule) | `layout.tsx` (rdv), `RdvPasseTab.tsx` | Admin/superviseur (full), dirigeant (read) | « Quelle différence entre l'onglet Rendez-vous et Rendez-vous passés ? » | **Quelle est la différence entre l'onglet « Rendez-vous » et « Rendez-vous passés » ?** | Audit Domaine 2 modules 1 et 5 | Suffisamment vérifiable |
| 3.4 | 3 systèmes "QR" sans rapport fonctionnel (QR public établissement, scan de présence, badge QR personnel membre) | `CodeQrTab.tsx`, écran Scanner (`layout.tsx`), `EquipeTab.tsx` | Admin/agent (QR+scanner), admin (badge équipe) | « Quelle différence entre le QR de mon établissement, le scan de présence et le badge d'un membre ? » | **Quelle est la différence entre les 3 codes QR de Yelen (établissement, présence, badge membre) ?** | Registre T10 | Suffisamment vérifiable — mais Phase C classe T10 "en réserve" (PR1 seul, aucune confusion réelle prouvée) → priorité basse |
| 3.5 | Compteur de réservations attribuées au QR/lien (`?source=qr`) | `CodeQrTab.tsx` | Admin/agent | « Ce compteur inclut-il tous mes RDV ou seulement ceux via le QR ? » | **Que mesure exactement le compteur affiché sur mon code QR ?** | Audit Domaine 2 module 7 | Suffisamment vérifiable — candidat mineur, envisager une aide contextuelle plutôt qu'un article séparé |

---

## 4. Services & offres (fourchette V1 : 1-3 + 1-3)

> Catégorie séparée en deux le 23/09/2026 (retour Bryan, voir
> `YELEN_PUBLIC_HELP_CENTER_ARCHITECTURE.md` §2/§11.2) : **4.1** →
> domaine `services`, **4.3**/**4.4** → domaine `partenariat`. **4.2**
> (comparaison Services/Mes Offres) va dans `partenariat` — décision
> éditoriale, la confusion part de l'écran Mes Offres. Numérotation des
> lignes ci-dessous inchangée (référence historique), seul le domaine
> réel dans `lib/helpCenter/data.ts` a changé — même mécanique que la
> note du §8 (Finance/Yelen Business) pour la même raison : ne jamais
> mélanger deux sujets distincts dans un seul article/catégorie.

| # | Fonctionnalité réelle | Écran/route | Rôle(s) | Question utilisateur plausible | Article candidat | Preuves code | Statut |
|---|---|---|---|---|---|---|---|
| 4.1 | 2 catalogues distincts sur un même écran (offre gratuite vs services payants) | `ServicesTab.tsx` | Admin/comptable/superviseur | « Quelle différence entre mon offre gratuite et mes services payants ? » | **Quelle est la différence entre l'offre gratuite et les services payants sur ma fiche Yelen ?** | Audit Domaine 3 module 1 | Suffisamment vérifiable |
| 4.2 | Aucune modération sur Services (publication immédiate) vs modération Yelen obligatoire sur Mes Offres | `ServicesTab.tsx` vs `MesOffresTab.tsx` | Admin/comptable/superviseur (services) ; admin/superviseur, partenaire approuvé (offres) | « Pourquoi mon service est visible tout de suite mais pas mon offre marketing ? » | **Pourquoi mes services sont publiés immédiatement mais mes offres partenaires doivent être validées par Yelen ?** | Audit Domaine 3 modules 1 et 2 | Suffisamment vérifiable sur le comportement — délai réel de modération non mesurable (ne pas l'inventer) |
| 4.3 | 6 statuts réels d'une offre partenaire ; Suspendre (réversible) vs Archiver (définitif) | `MesOffresTab.tsx` | Admin/superviseur | « Que signifient les statuts de mon offre ? Différence Suspendre/Archiver ? » | **Que signifient les statuts d'une offre partenaire, et quelle différence entre « Suspendre » et « Archiver » ?** | Audit Domaine 3 module 2 ; registre T7 (partiel) | Suffisamment vérifiable |
| 4.4 | Programme Partenariat : candidature (admin) → 4 statuts → tableau de bord dédié, débloque Mes Offres | `PartenariatTab.tsx` / `MonPartenariatTab.tsx` | Admin (candidature), consultation plus large | « Comment devenir partenaire ? Pourquoi je ne vois pas Mes Offres ? » | **Comment devenir partenaire Yelen et débloquer l'onglet Mes Offres ?** | Audit Domaine 3 module 3 ; registre T7 (gate d'accès jamais expliquée côté nav) | Informations manquantes — critère "site web officiel requis" non vérifié en détail (À VÉRIFIER), aucun délai de réponse mesurable |

---

## 5. Communication & réputation (fourchette V1 : 2-4)

| # | Fonctionnalité réelle | Écran/route | Rôle(s) | Question utilisateur plausible | Article candidat | Preuves code | Statut |
|---|---|---|---|---|---|---|---|
| 5.1 | 4 canaux citoyen↔institution aux règles de visibilité différentes (Questions publiques avant RDV, Messagerie privée, Avis publics après RDV, Signalements formels/tracés) | `QuestionsClientsTab.tsx`, `MessagerieTab.tsx`, `AvisReputationTab.tsx`, `SignalementsTab.tsx` | Admin/agent/superviseur (majoritairement) | « Quelle différence entre répondre à une question, un avis, un message, un signalement ? » | **Questions clients, Messagerie, Avis, Signalements : quels canaux pour communiquer avec vos clients ?** | Registre T9 — candidat le mieux évidencé de la matrice C pour un article (forme B) | Suffisamment vérifiable — priorité haute |
| 5.2 | Score de réputation (Santé du compte) : 0-100, 4 niveaux, seuil minimum 3 avis | `AvisReputationTab.tsx` | Admin/agent/superviseur (full), dirigeant (read) | « Comment mon score est-il calculé exactement ? » | **Comment est calculé le score de réputation (Santé du compte) de mon établissement ?** | `lib/reputationScore.ts` ; note bleue déjà livrée in-product (T11-A, 21/09/2026) | Suffisamment vérifiable — conversion directe d'un contenu déjà vérifié |
| 5.3 | Statut `terminee` dérivé d'une annonce (date d'expiration dépassée), jamais une suppression | `CommunicationTab.tsx` | Admin/superviseur | « Pourquoi mon annonce est passée en Terminée toute seule ? » | **Pourquoi mon annonce passe-t-elle automatiquement au statut « Terminée » ?** | Audit Domaine 4 module 1, `realStatut()` | Suffisamment vérifiable |
| 5.4 | Yelen Community : candidature (même architecture que Partenariat) → posts modérés, planification réelle | `CommunauteProTab.tsx` | Admin/superviseur | « Comment publier sur Yelen Community ? Comment marche la planification ? » | **Comment rejoindre Yelen Community et publier une actualité de mon établissement ?** | Audit Domaine 4 module 2 ; registre T8 | Informations manquantes — texte exact affiché sur la modération d'un post planifié non confirmé (À VÉRIFIER) |

---

## 6. Équipe & organisation (fourchette V1 : 2-4)

| # | Fonctionnalité réelle | Écran/route | Rôle(s) | Question utilisateur plausible | Article candidat | Preuves code | Statut |
|---|---|---|---|---|---|---|---|
| 6.1 | 5 rôles d'équipe, accès différent aux écrans du dashboard | `EquipeTab.tsx`, `lib/institutionPermissions.ts` (`ROLE_DESCRIPTIONS`, `DOMAINE_LABELS` déjà rédigés) | Admin (gestion), tous (subissent le RBAC) | « Pourquoi je ne vois pas cet onglet ? Que peut faire chaque rôle ? » | **Quels sont les 5 rôles d'équipe sur Yelen et que peut faire chacun ?** | Audit §1.2 et §3 ; texte produit déjà écrit dans le code (`ROLE_DESCRIPTIONS`) | Suffisamment vérifiable — priorité haute, contenu de base déjà rédigé côté produit |
| 6.2 | Invitation d'un membre = proxy (pas de lien/email) ; badge QR personnel active un poste d'accueil physique | `EquipeTab.tsx` | Admin | « Pourquoi ce membre reste bloqué en invitation ? À quoi sert le badge QR ? » | **Comment fonctionne l'invitation d'un membre d'équipe, et à quoi sert son badge QR ?** | Audit Domaine 5 module 1 | Suffisamment vérifiable — seuil exact de tentatives avant verrouillage (`locked_until`) non confirmé, à exclure du texte |
| 6.3 | Niveau de risque du Journal d'activité — règle déterministe, pas une formule pondérée | `JournalTab.tsx` | Admin/superviseur/dirigeant | « Que signifie le niveau de risque affiché ? » | **Comment est déterminé le niveau de risque affiché dans le Journal d'activité ?** | `lib/journalTaxonomie.ts::scoreRisque()` ; note bleue déjà livrée in-product (T11-B, 21/09/2026) | Suffisamment vérifiable — conversion d'un contenu déjà vérifié |
| 6.4 | Collaboration interne : DM/groupes, pas de recherche plein texte, pas de présence en ligne réelle | `CollaborationTab.tsx` | 5 rôles | « Pourquoi pas de recherche dans mes messages ? Pourquoi pas de statut en temps réel ? » | **Quelles sont les fonctionnalités actuelles (et limites) de la messagerie interne Collaboration ?** | Audit Domaine 5 module 3 | Informations manquantes — non confirmé si ces limites sont déjà dites à l'écran (À VÉRIFIER) ; priorité basse |
| 6.5 | Espace de travail conçu "PC-first, sans logique mobile" (retour Bryan explicite) | `EspaceTravailTab.tsx` | Tous sauf comptable | « Pourquoi cet écran fonctionne mal sur mon téléphone ? » | — | Audit Domaine 5 module 5 | **Ne pas documenter** — décision produit non tranchée (corriger l'UX responsive ou documenter la limite), en observation |

---

## 7. Sécurité & conformité (fourchette V1 : 3-5)

| # | Fonctionnalité réelle | Écran/route | Rôle(s) | Question utilisateur plausible | Article candidat | Preuves code | Statut |
|---|---|---|---|---|---|---|---|
| 7.1 | 8 statuts réels d'un signalement, graphe de transitions légal en code | `SignalementsTab.tsx` | Admin/superviseur (full), agent/dirigeant (read, nuance notes internes) | « Que signifie le statut de mon signalement ? » | **Que signifient les statuts d'un signalement (nouveau, en cours, résolu...) et que se passe-t-il ensuite ?** | Registre T12 ; `lib/signalementsConstants.ts`, `SIGNALEMENT_TRANSITIONS` | Suffisamment vérifiable |
| 7.2 | Signalement bidirectionnel reçu d'un citoyen contre l'institution (badge "Contre vous") | `SignalementsTab.tsx` | Admin/superviseur (full), dirigeant (read) | « J'ai reçu un signalement, que dois-je faire et sous quel délai ? » | **J'ai reçu un signalement d'un citoyen contre mon établissement — que se passe-t-il maintenant ?** | **B3-1, preuve PR3** (cas réel confirmé, corpus support) | Informations manquantes — délai réel de traitement non reconfirmé (ancien guide citait "72h", jamais revérifié) ; ne publier aucun délai chiffré sans confirmation |
| 7.3 | Signalement déposé par l'institution contre un citoyen (ex. absence répétée), garde-fou "RDV éligible requis" | `SignalementsTab.tsx` (création 4 étapes) | Admin/superviseur | « Pourquoi je ne peux pas signaler ce citoyen ? Comment signaler une absence répétée ? » | **Comment signaler un citoyen (absence répétée, comportement abusif...) et pourquoi un rendez-vous est-il exigé ?** | Cas 4/5 du corpus support, **PR3** — cycle complet jusqu'à clôture confirmé en production | Suffisamment vérifiable — meilleure preuve de production du corpus |
| 7.4 | PIN institution-wide, Passkeys (WebAuthn), TOTP, appareils mémorisés | `SecuriteCompteTab.tsx` | Admin | « Qu'est-ce qu'une clé d'accès (Passkey) ? Comment protéger mon compte ? » | **Comment protéger mon compte avec un code PIN, une clé d'accès (Passkey) ou la double authentification ?** | Audit Domaine 1 module 8 | Suffisamment vérifiable |

---

## 8. Finance & Yelen Business (fourchette V1 : 2-4)

> Catégorie re-séparée en deux le 22/09/2026 (voir
> `YELEN_PUBLIC_HELP_CENTER_ARCHITECTURE.md` §2) : **8.1** →
> domaine `finance`, **8.2** → domaine `yelen-business`. Numérotation des
> lignes ci-dessous inchangée (référence historique), seul le domaine
> réel dans `lib/helpCenter/data.ts` a changé.

| # | Fonctionnalité réelle | Écran/route | Rôle(s) | Question utilisateur plausible | Article candidat | Preuves code | Statut |
|---|---|---|---|---|---|---|---|
| 8.1 | Admin en lecture seule sur Paiements tant qu'un comptable actif existe (sauf mode urgence) | `PaiementsTab.tsx`, `lib/comptableProtection.ts` | Admin/comptable | « Pourquoi je ne peux pas rembourser en tant qu'admin ? » | **Pourquoi un administrateur ne peut-il pas effectuer de remboursement si un comptable est actif ?** | Registre **P15** — meilleur exemple de blocage expliqué de tout l'audit | Suffisamment vérifiable — texte produit déjà écrit |
| 8.2 | 2 écrans "Facturation" distincts (institution→client vs Yelen→institution) | `FacturationTab.tsx` vs `YelenFacturationTab.tsx` | Admin/comptable | « Quelle différence entre Facturation et Facturation Yelen ? » | **Quelle est la différence entre « Facturation » (vos clients) et « Facturation Yelen » (votre abonnement) ?** | Registre **P16** | Suffisamment vérifiable |
| 8.3 | 9 des 10 écrans Yelen Business affichent des champs "Bientôt disponible" (`ChampBientot`/`SectionBientot`), rien n'est simulé | `YelenCompteTab.tsx` + 8 autres | Admin/comptable (accès complet), dirigeant (lecture partielle) | « Pourquoi presque tout est vide dans Yelen Business ? » | **Pourquoi la plupart des écrans Yelen Business affichent-ils « Bientôt disponible » ?** | Audit Domaine 8, constat d'architecture `ChampBientot`/`SectionBientot` | Suffisamment vérifiable — évite de laisser deviner une fonctionnalité absente |
| 8.4 | Onglet "Litiges" (Paiements) structurellement présent mais toujours vide | `PaiementsTab.tsx` | Admin/comptable | « Comment fonctionne l'onglet Litiges ? » | **Comment fonctionne l'onglet « Litiges » de mes paiements ?** | Audit Domaine 7 module 1 | Suffisamment vérifiable — article séparé (retour Bryan 23/09/2026, décision de fusion dans 8.3 retirée : 8.3 est un article Yelen Business, Litiges relève de Finance/Paiements, deux sujets/catégories distincts ne doivent jamais être mélangés dans un seul article) ; vérifier d'abord si l'écran affiche déjà un message honnête avant rédaction finale |
| 8.5 | `yelen-support` visible dans la nav mais ne rend aucun contenu | TabKey `yelen-support` | Admin/comptable | « Où est passé le support depuis ce menu ? » | — | **UX5** — bug confirmé par lecture directe du code | **Ne pas documenter** — bug produit à corriger (backlog), jamais un contenu d'aide à la place (principe 10 de l'architecture) |

---

## 9. Recommandations de priorité (regroupement, pas un classement figé)

**Total cartographié : 34 candidats réels + 2 cas explicitement routés hors
Help Center** (2 "ne pas documenter" — 6.5, 8.5) — cohérent avec la
fourchette ~20-36 de l'architecture verrouillée, sans quota à remplir.
**Plus aucune décision de fusion** (retour Bryan 23/09/2026) : le Help
Center doit rester fluide, jamais un article ou une catégorie qui mélange
plusieurs sujets — chaque écran/sujet reçoit son propre candidat, quitte
à rester priorité basse si la preuve est faible (voir 8.4 ci-dessous).

### Priorité haute — preuve la plus forte et/ou contenu déjà écrit ailleurs
Conversion directe d'un texte produit déjà vérifié (notes in-product
livrées 21/09/2026, ou texte déjà rédigé dans le code lui-même) : **2.3**
(horaires), **5.2** (score réputation), **6.1** (rôles RBAC — texte
`ROLE_DESCRIPTIONS` déjà écrit), **6.3** (score risque), **8.1**
(protection domaine comptable), **8.2** (Facturation clients/Yelen).
Preuve de production la plus forte du corpus support (PR3) : **7.2**,
**7.3**. Candidat transverse le mieux évidencé de la matrice C : **5.1**
(T9).

### Priorité moyenne — comportement confirmé, un détail à vérifier avant rédaction
**1.3**, **1.4**, **1.5**, **2.1**, **2.2** (sans délai chiffré), **3.1**,
**3.2** (sans seuils exacts), **3.3**, **4.1**, **4.2** (sans délai de
modération), **4.3**, **7.1**, **7.4**, **8.3**.

### Priorité basse — preuve faible (PR1 seul) ou périmètre déjà couvert autrement
**2.4** (Phase C : aide contextuelle in-modal jugée suffisante), **3.4**
(T10 "en réserve", aucune confusion réelle prouvée), **3.5**, **4.4**
(critère partenariat à vérifier), **5.4** (wording à vérifier), **6.2**,
**6.4**, **8.4** (écran vide, honnêteté d'abord — ex-candidat à fusion,
redevenu un article séparé le 23/09/2026, voir §8).

### Hors Help Center, à ne pas transformer en article
**6.5** (décision produit non tranchée), **8.5** (bug UX5, correction
produit requise) — pour mémoire, l'ambiguïté "facturation" du corpus
support (B3-3, PR4, 0 ticket) reste également hors périmètre tant
qu'aucun cas réel n'existe.

---

**ARRÊT — Cartographie du Corpus V1 restituée. Aucun article rédigé.
En attente de validation explicite de Bryan avant toute rédaction.**
