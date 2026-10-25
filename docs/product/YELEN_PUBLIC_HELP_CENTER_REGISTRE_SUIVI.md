# Yelen Public Help Center — Registre de suivi (mapping dashboard ↔ guides)

Document de suivi, pas de contenu brut (le contenu éditorial vit dans
`lib/helpCenter/data.ts`). Complète `YELEN_PUBLIC_HELP_CENTER_ARCHITECTURE.md`
§12 (décision verrouillée 24/09/2026) et projette `YELEN_PUBLIC_HELP_CENTER_CORPUS_V1.md`
sous un angle inverse : **par écran dashboard** plutôt que par article.

**Méthode** : chaque ligne reprend un écran (`Écran/route`) déjà cité
dans le Corpus V1, sans nouvelle preuve — aucune fonctionnalité
supposée, aucun écran ajouté qui ne soit déjà dans le corpus existant.
Un écran peut avoir 0, 1 ou plusieurs guides associés (§12, pas de
rebuild 1 écran = 1 guide).

**Colonnes** :
- **Guide(s) associé(s)** : identifiants des candidats du Corpus V1
  (ex. `2.3`) dont la colonne `Écran/route` référence cet écran.
- **Capture** : Oui/Non — aucune capture n'existe à ce jour (politique
  compte de démo, §12, rien de produit).
- **Lien contextuel** : Oui/Non — bouton "Guide" réellement câblé sur
  l'écran (`<HelpCenterGuide tab="..." />`), distinct des notes
  contextuelles in-product T5/T11-A/T11-B (mécanisme différent, voir
  `YELEN_PROVIDER_HELP_CENTER_ARCHITECTURE.md` §12). "N/A" = candidat
  volontairement sans bouton (mécanisme transverse sans TabKey, ou
  écran déjà pourvu d'une aide in-product propre suffisante).
- **Statut** : À faire / En cours / Terminé — "En cours" quand au moins
  un candidat de la ligne est publié mais pas tous ; "Terminé" quand
  tous les candidats listés pour cet écran sont publiés.

**STATUT GLOBAL AU 17/10/2026 — PAUSE DEMANDÉE PAR BRYAN.** 24 candidats
sur 26 traités dans cette session (priorités haute + moyenne
intégralement terminées, 5/8 de la priorité basse faits). Reste 3
candidats de priorité basse (6.2, 6.4, 8.4) — voir Plan d'exécution plus
bas. Reprise possible à tout moment : tout est documenté, aucune
décision en suspens ne bloque la suite.

---

## Commencer avec Yelen

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `app/institution/inscription/engine/*` | 1.1 | Commencer avec Yelen | Non | — | **À faire — voir Revue critique (1.1/1.2 absents de la priorisation Corpus V1 §9)** |
| Accueil (`layout.tsx`, empty states par statut) | 1.2 | Commencer avec Yelen | Non | — | **À faire — idem** |
| `CentreConfigurationTab.tsx` | 1.3 | Commencer avec Yelen | Non | Oui | Terminé |
| `CompteSuspenduScreen.tsx` | 1.4 | Commencer avec Yelen | Non | Oui | Terminé |
| Mécanisme transverse (Yelen Security Activation, pas d'écran dédié) | 1.5 | Commencer avec Yelen | Non | N/A | Terminé (article publié, aucun bouton — pas de TabKey naturel) |
| `ReauthModal.tsx` (mécanisme transverse, pas d'écran dédié) | 2.4 | Accueil & configuration | Non | N/A | Terminé (article publié, aucun bouton — Phase C a déjà jugé l'aide in-modal suffisante) |

## Accueil & configuration

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `ProfilEntrepriseTab.tsx` | 2.1, 2.2, 2.3 | Accueil & configuration | Non | Oui | Terminé |
| `ProfilResponsableTab.tsx` | 2.1 | Accueil & configuration | Non | Oui | Terminé |
| `ProfilTab.tsx` | 2.1 | Accueil & configuration | Non | Oui | Terminé |
| `SecuriteCompteTab.tsx` | 2.1, 2.4 (+ 7.4, voir Sécurité & conformité) | Accueil & configuration | Non | Oui | Terminé |
| `DocumentsTab.tsx` | 2.2 | Accueil & configuration | Non | Oui | Terminé |
| `DisponibilitesTab.tsx` | 2.3 | Accueil & configuration | Non | Oui | Terminé |
| `ParametresTab.tsx` (+ `ReauthModal.tsx`) | 2.4, 2.5 | Accueil & configuration | Non | N/A pour 2.4 | En cours (2.4 publié sans bouton, 2.5 à faire) |

## RDV & clients

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `ValiderRdvTab.tsx` | 3.1 | RDV & clients | Non | Oui | Terminé |
| `DocumentsClientsTab.tsx` | 3.2 | RDV & clients | Non | Oui | Terminé |
| Onglet Rendez-vous (`layout.tsx`) | 3.3 | RDV & clients | Non | Oui | Terminé |
| `RdvPasseTab.tsx` | 3.3 | RDV & clients | Non | Oui | Terminé |
| `CodeQrTab.tsx` | 3.4, 3.5 | RDV & clients | Non | Oui | Terminé |
| Écran Scanner (`layout.tsx`) | 3.4 | RDV & clients | Non | **Non — gap connu, voir Revue critique** | Contenu publié, bouton pas câblé sur cet écran précis (accessible via CodeQrTab/EquipeTab) |
| `EquipeTab.tsx` (badge QR membre) | 3.4 (+ 6.1, 6.2, voir Équipe & organisation) | RDV & clients | Non | Oui | En cours (6.1/3.4 publiés, 6.2 à faire) |

## Services

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `ServicesTab.tsx` | 4.1 | Services | Non | N/A | Terminé (article publié, aucun bouton — écran déjà pourvu de 2 aides in-product propres, voir Revue critique) |

## Partenariat

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `MesOffresTab.tsx` | 4.2, 4.3 | Partenariat | Non | Oui | Terminé |
| `PartenariatTab.tsx` / `MonPartenariatTab.tsx` | 4.4 | Partenariat | Non | Oui | Terminé |

## Communication & réputation

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `QuestionsClientsTab.tsx` | 5.1 | Communication & réputation | Non | Oui | Terminé |
| `MessagerieTab.tsx` | 5.1 | Communication & réputation | Non | Oui | Terminé |
| `AvisReputationTab.tsx` | 5.1, 5.2 | Communication & réputation | Non | Oui | Terminé |
| `SignalementsTab.tsx` | 5.1, 7.1, 7.2, 7.3 | Communication & réputation / Sécurité & conformité | Non | Oui | Terminé |
| `CommunicationTab.tsx` | 5.3 | Communication & réputation | Non | Non | À faire |
| `CommunauteProTab.tsx` | 5.4 | Communication & réputation | Non | Oui | Terminé |

## Équipe & organisation

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `EquipeTab.tsx` | 6.1, 6.2 (+ 3.4, voir RDV & clients) | Équipe & organisation | Non | Oui | En cours (6.1 + 3.4 publiés, **6.2 reste à faire**) |
| `JournalTab.tsx` | 6.3 | Équipe & organisation | Non | Oui | Terminé |
| `CollaborationTab.tsx` | 6.4 | Équipe & organisation | Non | Non | **À faire** |
| `EspaceTravailTab.tsx` | 6.5 | — | — | — | **Hors Help Center** (décision produit non tranchée, voir Corpus V1) |

## Sécurité & conformité

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `SignalementsTab.tsx` | 7.1, 7.2, 7.3 (+ 5.1) | Sécurité & conformité | Non | Oui | Terminé |
| `SecuriteCompteTab.tsx` | 7.4 (+ 2.1, 2.4) | Sécurité & conformité | Non | Oui | Terminé |

## Finance

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `PaiementsTab.tsx` | 8.1, 8.4 | Finance | Non | Oui | En cours (8.1 publié, **8.4 « Litiges » reste à faire**) |
| `FacturationTab.tsx` | 8.2 | Finance | Non | Oui | Terminé |

## Yelen Business

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `YelenFacturationTab.tsx` | 8.2, 8.3 | Yelen Business | Non | Oui | Terminé |
| `YelenCompteTab.tsx` + 7 autres (`YelenContratTab`, `YelenForfaitTab`, `YelenPaiementsTab`, `YelenTransactionsTab`, `YelenFraisTab`, `YelenReconciliationTab`, `YelenDocumentsTab`) | 8.3 | Yelen Business | Non | Oui | Terminé (9 écrans câblés, voir Revue critique pour la correction du compte "9 des 10 écrans") |
| TabKey `yelen-support` | 8.5 | — | — | — | **Hors Help Center** (bug UX5 confirmé, correction produit requise, pas un contenu d'aide) |

---

## Plan d'exécution — reprise du chantier 17/10/2026

Bryan a redonné le feu vert explicite pour reprendre la rédaction, avec
une méthode fixée : **un écran/candidat à la fois, jamais en bloc**.
Pour chaque candidat, dans l'ordre ci-dessous :

1. Lire le code réel de l'écran concerné (pas seulement le Corpus V1,
   qui peut avoir vieilli).
2. Rédiger ou mettre à jour l'article dans `lib/helpCenter/data.ts`,
   ton humain et explicite.
3. Câbler `<HelpCenterGuide tab="..." />` sur l'écran si le TabKey n'a
   encore aucun bouton Guide (vérifier d'abord avec `grep`), sauf
   décision explicite contraire (mécanisme transverse, ou écran déjà
   pourvu d'une aide in-product équivalente).
4. Mettre à jour `lib/helpCenter/dashboardMapping.ts`.
5. Mettre à jour ce registre.
6. `tsc --noEmit` propre avant de passer au candidat suivant.

Ordre retenu = priorité verrouillée du Corpus V1 §9 (haute → moyenne →
basse), en sautant les 2 cas "hors Help Center" (6.5, 8.5).

### Priorité haute — TERMINÉE (9/9)
6.1, 5.1, 7.2, 7.3 traités cette session (4 déjà publiés avant reprise :
2.3, 5.2, 6.3, 8.1, 8.2).

### Priorité moyenne — TERMINÉE (14/14)
1.3, 1.4, 1.5, 2.1, 2.2, 3.1, 3.2, 3.3, 4.1, 4.2, 4.3, 7.1, 7.4, 8.3 —
tous traités cette session.

### Priorité basse — 5/8 faits, 3 restants
- [x] **2.4** — Pourquoi Yelen redemande une confirmation d'identité — publié 17/10/2026, aucun bouton (mécanisme transverse).
- [x] **3.4** — Les 3 codes QR de Yelen — publié 17/10/2026.
- [x] **3.5** — Ce que mesure le compteur du code QR — publié 17/10/2026.
- [x] **4.4** — Devenir partenaire Yelen et débloquer Mes Offres — publié 17/10/2026.
- [x] **5.4** — Rejoindre Yelen Community et publier une actualité — publié 17/10/2026.
- [ ] **6.2** — Comment fonctionne l'invitation d'un membre d'équipe, et à quoi sert son badge QR (`EquipeTab.tsx`).
- [ ] **6.4** — Quelles sont les fonctionnalités actuelles (et limites) de la messagerie interne Collaboration (`CollaborationTab.tsx`).
- [ ] **8.4** — Comment fonctionne l'onglet « Litiges » de mes paiements (`PaiementsTab.tsx`) — vérifier d'abord si l'écran affiche déjà un message honnête avant de rédiger.

**Prochain candidat à la reprise : 6.2** (`EquipeTab.tsx`, déjà lu cette
session pour 6.1/3.4 — vérifier uniquement la mécanique d'invitation et
le badge QR avant de rédiger).

---

## Revue critique de cette session — erreurs trouvées dans le Corpus V1

Conformément à la discipline "zéro donnée inventée" (CLAUDE.md
`/honnetete`), chaque candidat a été vérifié contre le code réel avant
rédaction — pas seulement contre le Corpus V1, qui peut avoir vieilli
depuis sa cartographie initiale (22/09/2026). 3 inexactitudes réelles
trouvées, corrigées dans les articles publiés, signalées ici pour que le
Corpus V1 lui-même soit mis à jour si besoin lors d'une prochaine
session :

1. **Candidat 3.3** (`RdvPasseTab.tsx`) — le Corpus V1 le décrit comme
   "lecture seule". Faux : la route `/api/institution/rdv-historique`
   accepte un PATCH (note de suivi interne) et un POST (envoi d'un
   rappel au citoyen). **Fait à part, hors périmètre Help Center** :
   l'écran lui-même affiche une icône-tooltip "Historique en lecture
   seule" — copie produit obsolète, incohérente avec ses propres
   fonctionnalités. Non corrigée (décision explicite de rester dans le
   périmètre Help Center uniquement) — à signaler à Bryan comme bug
   produit mineur.
2. **Candidat 8.3** (Yelen Business) — le Corpus V1 affirme "9 des 10
   écrans" affichent le badge "Bientôt disponible". Vérifié par `grep
   "Bientôt disponible"` sur tous les écrans Yelen Business : seuls 7
   l'utilisent réellement (Compte, Contrat, Forfait, Paiements,
   Transactions, Frais & commissions, Facturation). Réconciliation et
   Documents Yelen n'ont jamais ce badge — ils affichent un état vide
   honnête différent ("rien à rapprocher pour l'instant", aucun
   document disponible), construit volontairement ainsi selon leurs
   propres commentaires de code.
3. **Candidat 4.4** (Partenariat) — le Corpus V1 marquait deux points
   "informations manquantes" : (a) "aucun délai de réponse mesurable" —
   faux, `delai_moyen_jours` est une vraie moyenne calculée sur les
   demandes déjà tranchées, affichée uniquement si ≥3 décisions existent
   (`app/api/institution/partenariat/route.ts`) ; (b) "critère site web
   à vérifier" — confirmé exactement : un site web officiel est un
   prérequis bloquant avant toute candidature (message "Site web
   requis" dans `DemandePartenariatOverlay.tsx`).

**Gap structurel trouvé dans le Corpus V1, non résolu** : les candidats
**1.1** et **1.2** sont documentés en détail dans la cartographie §1 du
Corpus V1 mais **absents de la classification de priorité §9**
(ni haute, ni moyenne, ni basse, ni "hors Help Center"). Conséquence :
ils n'ont jamais été intégrés au plan de 26 candidats de cette session
et restent non traités. Avant une prochaine reprise, Bryan doit décider
d'une priorité pour ces 2 candidats (probablement moyenne ou basse, vu
leur nature "informations manquantes" déjà signalée en §1) — ne pas les
traiter par défaut sans cette décision explicite.

**Décisions de câblage délibérément différentes du mécanisme par
défaut** (aucune n'est un oubli) :
- **1.5, 2.4** : mécanismes transverses (Yelen Security Activation,
  ReauthModal) sans écran dédié ni TabKey naturel — article publié,
  jamais de bouton forcé.
- **4.1** (`ServicesTab.tsx`) : écran déjà pourvu de 2 aides in-product
  propres ("Guide des services", modale "Offre gratuite") — un 3e
  bouton "Guide" aurait surchargé un en-tête déjà dense sans réelle
  valeur ajoutée.
- **Écran Scanner** (`layout.tsx`, candidat 3.4) : aucun bouton câblé
  sur cet écran précis par manque de temps avant la pause — le contenu
  reste accessible via les boutons déjà posés sur `CodeQrTab.tsx` et
  `EquipeTab.tsx`. À compléter si une prochaine session repasse sur les
  écrans RDV & clients.

---

## Historique

**24/09/2026** — `lib/helpCenter/dashboardMapping.ts` créé, couvrait au
départ 5 articles (horaires, score réputation, risque journal,
remboursement comptable, Facturation vs Facturation Yelen). Découverte
au passage : la couche publique elle-même (routes, 19 composants,
sitemap/robots, mur mobile, widget feedback) était déjà entièrement
construite et non documentée ici.

**17/10/2026** — Correction de vérité terrain (7 TabKeys déjà câblés
avant cette session, non documentés). Reprise complète de la rédaction :
**23 nouveaux articles publiés en une session** (5 préexistants avant
cette session → 28 au total, confirmé par `grep -c '^    id: "'
lib/helpCenter/data.ts`) — candidat 6.1 en ouverture, puis 5.1/7.2/7.3
pour terminer la priorité haute, les 14 candidats de priorité moyenne,
puis 5 des 8 candidats de priorité basse. **Pause demandée par Bryan
après le candidat 5.4** — 3 candidats restants (6.2, 6.4, 8.4), tout
documenté pour une reprise ultérieure sans perte de contexte.

## Total

36 écrans distincts recensés (dérivés des 34 candidats du Corpus V1).
2 écrans explicitement hors Help Center (`EspaceTravailTab.tsx`, TabKey
`yelen-support`). 2 candidats (1.1, 1.2) non classés par priorité —
voir Revue critique.

**28 articles publiés au 17/10/2026** dans `lib/helpCenter/data.ts`
(vérifié par comptage direct, pas une estimation). **Plus de 20 TabKeys
avec lien "Guide" câblé** — liste exhaustive dans
`lib/helpCenter/dashboardMapping.ts`, seule source de vérité pour ce
chiffre. 0 capture produite (politique compte de démo, aucune capture
prévue avant un lot dédié).

**EN PAUSE — reprise possible à tout moment sur les 3 candidats
restants de priorité basse (6.2, 6.4, 8.4), voir Plan d'exécution
ci-dessus. Aucune décision bloquante en suspens, sauf la priorisation de
1.1/1.2 à trancher par Bryan avant de les ajouter à un futur lot.**
