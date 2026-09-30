# Yelen Public Help Center — Registre de suivi (mapping dashboard ↔ guides)

Document de suivi, pas de contenu. Aucun article rédigé, aucune capture
prise, aucun code modifié. Complète `YELEN_PUBLIC_HELP_CENTER_ARCHITECTURE.md`
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
- **Lien contextuel** : Oui/Non — bouton "Guide" câblé sur l'écran
  (distinct des notes contextuelles in-product déjà livrées T5/T11-A/
  T11-B, qui sont un mécanisme différent, voir
  `YELEN_PROVIDER_HELP_CENTER_ARCHITECTURE.md` §12).
- **Statut** : À faire / En cours / Terminé — vide = rien commencé.

---

## Commencer avec Yelen

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `app/institution/inscription/engine/*` | 1.1 | Commencer avec Yelen | Non | Non | À faire |
| Accueil (`layout.tsx`, empty states par statut) | 1.2 | Commencer avec Yelen | Non | Non | À faire |
| `CentreConfigurationTab.tsx` | 1.3 | Commencer avec Yelen | Non | Non | À faire |
| `CompteSuspenduScreen.tsx` | 1.4 | Commencer avec Yelen | Non | Non | À faire |
| Mécanisme transverse (Yelen Security Activation, pas d'écran dédié) | 1.5 | Commencer avec Yelen | Non | Non | À faire |

## Accueil & configuration

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `ProfilEntrepriseTab.tsx` | 2.1, 2.2, 2.3 | Accueil & configuration | Non | Non | À faire |
| `ProfilResponsableTab.tsx` | 2.1 | Accueil & configuration | Non | Non | À faire |
| `ProfilTab.tsx` | 2.1 | Accueil & configuration | Non | Non | À faire |
| `SecuriteCompteTab.tsx` | 2.1, 2.4 (+ 7.4, voir Sécurité & conformité) | Accueil & configuration | Non | Non | À faire |
| `DocumentsTab.tsx` | 2.2 | Accueil & configuration | Non | Non | À faire |
| `DisponibilitesTab.tsx` | 2.3 | Accueil & configuration | Non | Non | À faire |
| `ParametresTab.tsx` (+ `ReauthModal.tsx`) | 2.4, 2.5 | Accueil & configuration | Non | Non | À faire |

## RDV & clients

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `ValiderRdvTab.tsx` | 3.1 | RDV & clients | Non | Non | À faire |
| `DocumentsClientsTab.tsx` | 3.2 | RDV & clients | Non | Non | À faire |
| Onglet Rendez-vous (`layout.tsx`) | 3.3 | RDV & clients | Non | Non | À faire |
| `RdvPasseTab.tsx` | 3.3 | RDV & clients | Non | Non | À faire |
| `CodeQrTab.tsx` | 3.4, 3.5 | RDV & clients | Non | Non | À faire |
| Écran Scanner (`layout.tsx`) | 3.4 | RDV & clients | Non | Non | À faire |
| `EquipeTab.tsx` (badge QR membre) | 3.4 (+ 6.1, 6.2, voir Équipe & organisation) | RDV & clients | Non | Non | À faire |

## Services

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `ServicesTab.tsx` | 4.1, 4.2 | Services | Non | Non | À faire |

## Partenariat

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `MesOffresTab.tsx` | 4.2, 4.3 | Partenariat | Non | Non | À faire |
| `PartenariatTab.tsx` / `MonPartenariatTab.tsx` | 4.4 | Partenariat | Non | Non | À faire |

## Communication & réputation

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `QuestionsClientsTab.tsx` | 5.1 | Communication & réputation | Non | Non | À faire |
| `MessagerieTab.tsx` | 5.1 | Communication & réputation | Non | Non | À faire |
| `AvisReputationTab.tsx` | 5.1, 5.2 | Communication & réputation | Non | Non (note contextuelle T11-A déjà livrée, distincte) | En cours |
| `SignalementsTab.tsx` | 5.1 (+ 7.1, 7.2, 7.3, voir Sécurité & conformité) | Communication & réputation | Non | Non | À faire |
| `CommunicationTab.tsx` | 5.3 | Communication & réputation | Non | Non | À faire |
| `CommunauteProTab.tsx` | 5.4 | Communication & réputation | Non | Non | À faire |

## Équipe & organisation

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `EquipeTab.tsx` | 6.1, 6.2 (+ 3.4, voir RDV & clients) | Équipe & organisation | Non | Non | À faire |
| `JournalTab.tsx` | 6.3 | Équipe & organisation | Non | Non (note contextuelle T11-B déjà livrée, distincte) | En cours |
| `CollaborationTab.tsx` | 6.4 | Équipe & organisation | Non | Non | À faire |
| `EspaceTravailTab.tsx` | 6.5 | — | — | — | **Hors Help Center** (décision produit non tranchée, voir Corpus V1) |

## Sécurité & conformité

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `SignalementsTab.tsx` | 7.1, 7.2, 7.3 (+ 5.1, voir Communication & réputation) | Sécurité & conformité | Non | Non | À faire |
| `SecuriteCompteTab.tsx` | 7.4 (+ 2.1, 2.4, voir Accueil & configuration) | Sécurité & conformité | Non | Non | À faire |

## Finance

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `PaiementsTab.tsx` | 8.1, 8.4 | Finance | Non | Non | À faire |
| `FacturationTab.tsx` | 8.2 | Finance | Non | Non | À faire |

## Yelen Business

| Écran dashboard | Guide(s) associé(s) | Catégorie | Capture | Lien contextuel | Statut |
|---|---|---|---|---|---|
| `YelenFacturationTab.tsx` | 8.2 | Yelen Business | Non | Non | À faire |
| `YelenCompteTab.tsx` (+ 8 autres écrans Yelen Business) | 8.3 | Yelen Business | Non | Non | À faire |
| TabKey `yelen-support` | 8.5 | — | — | — | **Hors Help Center** (bug UX5 confirmé, correction produit requise, pas un contenu d'aide) |

---

## Mise à jour 24/09/2026 — mapping technique

`lib/helpCenter/dashboardMapping.ts` créé (table `TabKey → ArticleId[]`,
`getGuidesForTab`/`hasGuide`) — couvre les 5 articles déjà `publie` dans
`lib/helpCenter/data.ts` : `profil-entreprise`/`disponibilites` (horaires),
`avis-reputation` (score réputation), `journal` (risque), `paiements`
(remboursement comptable), `facturation`/`yelen-facturation` (Facturation
vs Facturation Yelen). Uniquement la donnée de mapping — aucun bouton
"Guide" câblé sur un écran dashboard à ce stade, colonne "Lien contextuel"
ci-dessus inchangée. Découverte au passage (24/09/2026) : la couche
publique elle-même (routes, 19 composants, sitemap/robots, mur mobile,
widget feedback + migration `20260923000001`) était déjà entièrement
construite et non documentée ici — voir mémoire du chantier pour le détail.

## Total

36 écrans distincts recensés (dérivés des 34 candidats du Corpus V1, un
écran pouvant apparaître dans plusieurs catégories quand il porte
plusieurs sujets distincts — ex. `SecuriteCompteTab.tsx`,
`SignalementsTab.tsx`, `EquipeTab.tsx`). 2 écrans explicitement hors
Help Center (`EspaceTravailTab.tsx`, TabKey `yelen-support`).

**0 capture produite, 0 lien "Guide" câblé.** 2 écrans ont déjà une note
contextuelle in-product livrée par un mécanisme distinct (T11-A sur
`AvisReputationTab.tsx`, T11-B sur `JournalTab.tsx`) — n'équivaut pas à
un lien "Guide" vers le Help Center public, à ne pas confondre au moment
du suivi.

**ARRÊT — Registre de suivi restitué, dérivé exclusivement du Corpus V1
déjà validé. Aucun article rédigé, aucune capture prise, aucun code
modifié. En attente d'instruction de Bryan pour la suite (scaffolding
technique, ou premier lot de rédaction).**
