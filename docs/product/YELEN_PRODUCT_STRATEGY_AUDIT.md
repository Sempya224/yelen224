# Yelen — Audit stratégique produit

Rédigé le 16/08/2026, à partir d'une lecture réelle du code (working tree
actuel, y compris les fichiers non commités), pas de la documentation seule.
Aucune ligne de code modifiée pour produire ce document. Toute affirmation
factuelle est vérifiable dans le code cité ; toute recommandation est
explicitement distinguée du constat.

Méthode : 3 audits en parallèle (recherche/découverte + confiance
institution ; offres/annonces/partenariat/monétisation ; Community +
identité citoyenne), synthétisés avec la connaissance déjà accumulée du
projet (sécurité, RBAC, modules financiers, signalements — dont le
chantier d'arbitrage Yelen livré hier).

---

## 01 — Executive Summary

Yelen a construit deux produits solides qui ne sont pas encore le produit
qu'ils prétendent être ensemble.

Côté institution, c'est déjà un **espace de travail opérationnel mature** :
~35 onglets fonctionnels (RDV, disponibilités, messagerie, équipe, pointage
RH, facturation, journal d'audit, gestion clients, arbitrage de litiges).
Côté citoyen, c'est une **application de consommation compétente** :
recherche, réservation, avis, communauté professionnelle, éducation
financière, récompenses.

Mais la promesse centrale — *« Yelen est l'endroit où je vérifie une
organisation avant de lui faire confiance »* — n'est aujourd'hui **pas
tenue par le produit réel**. Le badge « vérifié » est un bouton admin sans
aucune preuve requise. Le statut « validée » est le même bouton. Une table
`documents_institution` avec un vrai cycle de vie (reçu → validé/rejeté)
existe depuis le 11/07/2026 côté upload institution — mais **aucune route
admin ne l'a jamais lue ni écrite** ; le badge et le statut ne dépendent
d'aucune preuve. Ce n'est pas une fonctionnalité manquante parmi d'autres :
c'est le mur porteur de toute l'ambition stratégique qui n'existe pas
encore.

Deuxième constat structurant : il n'y a **aucune raison financière ou
compétitive forte** pour une organisation d'investir dans sa présence
Yelen aujourd'hui. Le plan d'abonnement (`plan`) n'a aucun effet dans le
code — colonne cosmétique. La page d'abonnement affiche des boutons Stripe
et PayPal désactivés (« à venir ») sur une page publique — un risque de
crédibilité en soi pour une plateforme de confiance. Le seul levier réel
de différenciation est le programme Partenariat → Offres, bien construit
mais étroit (marketing uniquement, jamais connecté à l'identité ou à la
confiance).

Ce qui va bien, et qu'il ne faut pas casser : l'architecture (Next.js +
Supabase, RLS par table) absorbe déjà une complexité réelle sans
réécriture nécessaire ; la séparation Offres/Annonces est une bonne
décision produit ; le design de confidentialité citoyenne (aucune donnée
publique par défaut, aucun score visible à un tiers) est cohérent et doit
rester un principe non négociable ; le chantier d'arbitrage des
signalements livré cette semaine est exactement le type de primitive de
confiance qu'une plateforme sérieuse doit avoir — peu de concurrents
locaux l'ont.

La priorité stratégique n°1 n'est pas une nouvelle fonctionnalité. C'est
de rendre réelle la vérification qui existe déjà sur le papier.

---

## 02 — Vision cible

Yelen à maturité : le citoyen ouvre Yelen par réflexe avant de faire
confiance à une organisation, parce que trois choses sont vraies en même
temps :

1. **« Vérifié » signifie quelque chose de vérifiable** — pas un bouton,
   une preuve (document + revue humaine + traçabilité + expiration).
2. **La réputation est visible et honnête** — pas un chiffre marketing,
   des faits (délai de réponse, taux de résolution de litige, ancienneté
   vérifiée) que l'organisation ne peut pas acheter.
3. **La découverte récompense la qualité réelle**, pas la présence brute
   — une organisation complète, vérifiée et réactive doit être plus visible
   qu'une fiche vide, à ranking égal par ailleurs.

Pour l'organisation : Yelen devient l'endroit où elle construit un actif
qui lui survit — une réputation qui a de la valeur en dehors de la
plateforme elle-même (comme un extrait Google My Business vérifié, mais
avec un vrai historique transactionnel derrière).

Pour le citoyen : Yelen reste un espace privé par défaut (aucune donnée
exposée sans son choix explicite), qui construit progressivement une
preuve de son propre historique (RDV honorés, avis laissés, démarches
suivies) — jamais un score public, toujours quelque chose qu'il contrôle
et montre à qui il choisit.

---

## 03 — Current State (ce qui existe réellement)

### Citoyen
- App unique (`app/page.tsx`), onglets Accueil / Recherche / RDV / Offres
  / Communauté / Compte. ~29 écrans `/compte/*` déjà construits.
- Identité : `public.users`, entièrement privée par défaut — confirmé par
  grep exhaustif, aucune policy RLS de lecture publique sur `users`.
  « Carte Yelen » (`/compte/carte-yelen`) : vraie carte d'identité + QR de
  check-in, mais statut statique (« Membre actif »), aucun niveau de
  confiance affiché. Section « L'écosystème Yelen arrive » : 2 items sur 4
  sont explicitement marqués « Bientôt » (non construits) dans le code
  lui-même.
- Sécurité citoyenne : PIN, WebAuthn, remember-token — solide, jamais
  exposée à un tiers (`lib/citoyenSecurite.ts`, scope strictement privé).
- Yelen Rewards (`/menu/recompenses`) : système de points/paliers réel et
  fonctionnel, explicitement pensé comme distinct de toute notion de score
  de confiance (commentaire code : *« ce solde EST fait pour être montré,
  c'est une monnaie gagnée, pas un jugement »*).
- Yelen Community : réel, modéré (approbation avant publication +
  signalement a posteriori, les deux fonctionnels), cadre « réseau
  professionnel façon LinkedIn » assumé dans le code — mais auteurs
  100% citoyens (aucune institution ne peut publier), **totalement
  déconnecté** des profils institution, gate de publication sur
  `identite_verifiee`.
- Notifications : push VAPID réel et câblé, uniquement transactionnel
  (cycle de vie RDV). Aucun mécanisme de digest, même désactivé — validé
  par grep. « Mon Assistant » est une bannière permanente déterministe, pas
  un digest poussé.
- Signalements (chantier clos hier) : Yelen devient seul arbitre des
  litiges institution↔citoyen, décision notifiée aux deux parties — une
  vraie primitive de confiance.

### Organisation
- Espace de travail dense : ~35 onglets dashboard (RDV, disponibilités,
  équipe, Clock In Shift/RH, facturation, journal d'audit, gestion
  clients, communication, arbitrage). Le produit opérationnel B2B est
  clairement le plus mature du projet.
- Fiche publique (`InstitutionPublicClient.tsx`, ~2000 lignes) :
  identité, horaires, services, avis, FAQ, questions publiques,
  conditions/informations — complète dans sa structure, mais **aucune
  carte/localisation affichée** même si `latitude`/`longitude` ont
  désormais un vrai parcours d'écriture (composant `LocationPicker.tsx`,
  non commité) — la fiche publique ne les lit tout simplement pas.
- Vérification : `badge_verifie` et `statut='validee'` sont chacun un
  update SQL déclenché par un seul bouton admin
  (`app/api/admin/institutions/[id]/badge|valider/route.ts`), sans lecture
  d'aucune preuve. La table `documents_institution` (cycle de vie
  reçu/validé/complément demandé/rejeté, prévue pour ça depuis
  11/07/2026) n'est **jamais consultée côté admin** — confirmé par grep
  exhaustif, zéro route. Le « Centre de configuration » institution
  considère l'étape vérification comme terminée dès qu'un document est
  simplement *reçu*, jamais qu'il soit *validé*.
- Réputation : `moyenne_avis`/`nb_avis` recalculés par trigger (corrigé le
  06/08 après avoir été figés à 0 depuis toujours) — donc un mécanisme
  fragile déjà pris en défaut une fois. Un score de santé interne
  (`lib/reputationScore.ts`, 0-100, pondéré note/réponse aux avis
  négatifs/annulations/réclamations) existe mais est **strictement
  institution-facing** — jamais montré au citoyen.
- Monétisation : `plan` (essentiel/pro/entreprise selon la doc, mais
  `gratuit`/`premium` en réalité dans le code — dérive déjà documentée)
  n'a **aucun effet fonctionnel nulle part** — colonne cosmétique lue
  uniquement pour afficher un badge dans l'admin. Page d'abonnement
  publique : boutons Stripe et PayPal désactivés (« intégration à
  venir »), seul chemin fonctionnel = un formulaire de virement manuel qui
  **n'est même pas relié à un `institution_id`**. Zéro commission Yelen
  sur les paiements citoyen↔institution (entièrement pair-à-pair,
  déclaratif, Yelen ne voit jamais l'argent).
- Partenariat/Offres : seul levier réel de différenciation aujourd'hui.
  Workflow d'approbation admin réel, suivi de clics réel
  (`offre_vues`/`nb_clics`), explicitement non connecté à `plan`. Bien
  construit, mais son seul bénéfice est marketing (visibilité sur l'écran
  Offres) — jamais lié à l'identité ou à la confiance.

### Recherche & découverte
- Institutions uniquement dans la grille principale (recherche par nom) ;
  l'overlay de recherche élargit à services/catégories/offres (fuzzy
  Levenshtein) — jamais aux posts Community ni aux personnes.
- Classement : 3 tris côté client (note / nb avis / alphabétique) — aucune
  pertinence calculée, aucune pondération par vérification, complétude de
  fiche, réactivité, ou popularité — alors qu'une table
  `recherches_populaires` existe déjà (nouvelle, réelle, mais utilisée
  seulement comme suggestions, jamais injectée dans le ranking).
- Deux taxonomies parallèles non unifiées : `category` (texte libre
  historique, utilisé par les filtres de recherche) vs `secteur` (enum à 8
  valeurs, utilisé à l'onboarding et sur la fiche publique) — la même
  organisation peut être filtrable différemment selon l'écran.

---

## 04 — Strategic Gaps

Classés par ce qu'ils empêchent, pas par ordre d'apparition dans le code.

1. **La vérification ne vérifie rien.** Conséquence directe : toute la
   proposition de valeur « confiance » repose sur un badge qu'un simple
   compte admin peut accorder sans preuve, à n'importe qui. Si Yelen
   grandit avant de corriger ça, le premier incident public (une
   institution « vérifiée » qui s'avère frauduleuse) détruit la
   crédibilité du badge pour toutes les autres.
2. **Aucune boucle qui récompense la qualité réelle dans la découverte.**
   Une fiche vide et une fiche complète, vérifiée, réactive apparaissent
   à égalité de tri (hors note brute). Rien n'incite une organisation à
   investir dans sa fiche au-delà du minimum.
3. **Aucun revenu, aucune conséquence économique testée.** Impossible de
   savoir aujourd'hui si des organisations paieraient pour quoi que ce
   soit sur Yelen — la question n'a jamais été posée avec un vrai produit
   payant en face.
4. **Réputation à sens unique.** Les organisations ont un score de santé
   interne riche ; les citoyens n'ont accès qu'à une moyenne brute. La
   confiance construite en interne n'est jamais montrée à l'extérieur.
5. **Community et identité organisation sont deux univers disjoints.**
   Une institution ne peut ni publier, ni être associée à un post, ni
   bâtir une réputation d'expertise dans l'espace conçu pour ça.
6. **Dette de cohérence des données** (deux taxonomies catégorie/secteur,
   deux nomenclatures de plan, colonnes mortes comme `niveau_confiance` et
   `document_officiel`) — pas bloquant seul, mais chaque nouvelle
   fonctionnalité construite par-dessus (ranking, facturation par plan)
   hérite de l'ambiguïté.

---

## 05 — Trust Architecture

### Ce que « Verified by Yelen » doit signifier

Pas un badge décoratif. Une affirmation vérifiable, datée, révocable :

- **Identité** : nom légal, forme juridique (`statut_juridique`, déjà
  collecté), preuve d'existence (document officiel réel — pas la colonne
  `document_officiel` legacy, la table `documents_institution` qui existe
  déjà et attend d'être branchée).
- **Responsable identifié** : la table `institution_responsables` existe
  déjà (mentionnée dans le modèle de données) — s'assurer qu'un humain
  responsable est nommé, pas seulement un compte générique.
- **Coordonnées vérifiées** : téléphone confirmé (déjà le cas pour les
  citoyens via OTP — étendre le même mécanisme aux institutions),
  adresse/localisation réelle (le `LocationPicker` non commité est la
  bonne pièce, il manque juste la vérification humaine derrière).
- **Historique** : ancienneté réelle sur Yelen (déjà disponible via
  `created_at`), volume de RDV traités, taux de réponse — des faits, pas
  un score composite opaque.

### Ce que ça implique concrètement (sans coder ici)

Un badge à 2 niveaux minimum, pas binaire :
- **Niveau 1 — Profil complet** (déterministe, automatique) : horaires,
  services, description, contact renseignés → visible immédiatement,
  aucune revue humaine nécessaire, juste une incitation à compléter.
- **Niveau 2 — Identité vérifiée** (revue humaine) : document déposé →
  examiné par un admin avec la table `documents_institution` déjà prévue
  → `valide` ou `rejete` avec motif → badge accordé *seulement* à ce
  moment, jamais avant, avec date d'octroi et date d'expiration/renouvellement.

La colonne `niveau_confiance` (`profil_basique`/`profil_verifie`/
`institution_certifiee`) existe déjà en base avec exactement cette forme à
3 paliers — elle n'est simplement jamais lue ni écrite aujourd'hui. C'est
probablement la bonne colonne à activer plutôt qu'en inventer une
nouvelle.

### Risques à traiter explicitement (pas à ignorer)

- **Acheter la réputation** : la vérification ne doit jamais être un
  produit payant en soi — un abonnement peut débloquer des outils
  (analytics, mise en avant), jamais le badge. Le principe du brief est
  juste : payer pour la confiance la détruit.
- **Fausse organisation** : la revue humaine du document est la seule
  défense réelle — automatiser entièrement la vérification serait un
  contresens pour une plateforme de confiance à ce stade de maturité.
- **Compte compromis** : hors périmètre de cet audit produit, mais lié à
  la sécurité déjà auditée cette session (2FA institution, `adminAuth.ts`
  deny-by-default) — la brique technique existe, il manque un processus
  de révocation de badge en cas de compromission avérée.
- **Correction d'information erronée** : déjà partiellement couvert par
  le système de signalement (un citoyen peut signaler « informations
  fausses ») — mais aujourd'hui rien ne relie une résolution de
  signalement à une remise en question du badge/statut. À connecter.
- **Qui décide ?** Aujourd'hui : n'importe quel admin avec la permission
  `institutions.manage`. À terme, la revue de vérification devrait être
  une permission distincte et plus restreinte que la gestion générale des
  institutions — c'est un pouvoir différent (juger une preuve) d'une
  action opérationnelle (suspendre un compte).
- **Expiration** : aucune notion d'expiration n'existe nulle part
  aujourd'hui sur `badge_verifie`. Un badge qui ne se périme jamais perd
  sa valeur avec le temps (l'entreprise a pu fermer, changer de main).

---

## 06 — Organization Strategy

Ce que doit être une fiche organisation à maturité, et l'écart réel avec
aujourd'hui :

| Couche | Existe | État réel |
|---|---|---|
| Identité | Oui | Champs complets, mais 2 taxonomies parallèles (catégorie/secteur) |
| Preuve | Table prête | `documents_institution` orpheline, jamais consultée |
| Responsables | Table existe | Non auditée dans cette session — à vérifier si réellement utilisée |
| Équipe | Oui, mature | Équipe & Accès + Clock In Shift, très construits |
| Services | Oui | jsonb libre, pas de structure vérifiable |
| Réputation | Oui, mais à sens unique | Riche en interne, quasi inexistante côté citoyen (moyenne brute seule) |
| Offres | Oui | Bien construit, gouvernance claire, mais isolé de l'identité |
| Annonces | Oui | Auto-publication, pas de revue |
| Communauté | Non | Aucune capacité de publication institution |
| Historique | Partiel | Journal d'activité existe (interne), rien côté citoyen |
| Statistiques | Interne uniquement | Centre d'analyse riche, jamais exposé publiquement (ce qui est correct — mais pourrait alimenter des faits publics sélectionnés, ex. « répond en moyenne sous 2h ») |

Pourquoi une organisation voudrait investir dans Yelen : aujourd'hui,
principalement parce que les outils opérationnels gratuits (RDV, HR,
facturation) sont utiles en soi — ce qui est déjà une vraie proposition
de valeur, mais **indépendante de la confiance/réputation**. Une
institution peut très bien utiliser Yelen comme simple outil de gestion
sans que ça construise l'écosystème de confiance visé. Le pont manquant :
faire que l'usage opérationnel (déjà adopté) alimente automatiquement la
réputation publique (ex. le taux de ponctualité déjà mesurable via
`journal_activite`/`rdv_events` pourrait devenir un fait public sans
qu'aucune institution ait à « faire un effort marketing » en plus).

---

## 07 — Citizen Strategy

Le citoyen revient quotidiennement pour trois raisons déjà en germe dans
le produit actuel, mais pas encore connectées entre elles :

1. **Utilité transactionnelle immédiate** (RDV, documents, paiements) —
   déjà solide.
2. **Espace personnel qui capitalise dans le temps** (Mes démarches, Mes
   avis, Carte Yelen, Yelen Rewards) — décision stratégique déjà actée
   (« Yelen = espace personnel de confiance, pas une super app ») et
   correctement exécutée dans le code (confidentialité par défaut).
3. **Communauté professionnelle** — la pièce la plus jeune, la moins
   connectée aux deux autres.

Le principe déjà en place — jamais de score citoyen visible — est une
force stratégique différenciante (à l'opposé d'un score de crédit social)
et doit rester non négociable. La bonne extension n'est pas d'ajouter un
score, mais d'ajouter des **preuves factuelles que le citoyen choisit de
montrer** (ex. « 12 RDV honorés depuis 2026 », visible seulement s'il
active un partage explicite) — cohérent avec le mécanisme déjà utilisé
pour les préférences de partage de données (`citoyen_prefs_partage`).

Ne pas construire : un profil citoyen public par défaut, un flux
d'activité visible par d'autres sans action explicite, quoi que ce soit
qui ressemble à un classement entre citoyens.

---

## 08 — Search & Discovery

Pourquoi un citoyen ouvrirait Yelen plutôt que Google/Facebook pour
trouver une organisation : aujourd'hui, essentiellement parce qu'il veut
*réserver un RDV* — pas parce que Yelen lui donne une information que
Google n'a pas. C'est un problème stratégique : la recherche doit devenir
la porte d'entrée qui prouve la valeur ajoutée de la confiance, pas
seulement un moteur de réservation.

Ce que Yelen peut offrir que Google ne peut pas : une vérification
humaine réelle (une fois construite, cf. section 05), un historique
transactionnel réel (taux de ponctualité, délai de réponse — déjà
mesurable en interne), et un canal d'interaction direct (RDV, questions
publiques — déjà construit).

Écarts concrets à corriger avant d'investir dans une recherche plus
sophistiquée :
- Unifier `category`/`secteur` — impossible de construire un bon ranking
  sur une taxonomie fragmentée.
- Faire que le badge de vérification (une fois réel) pèse dans le tri —
  actuellement le filtre « Vérifié » existe mais ne change jamais l'ordre
  des résultats, seulement leur présence/absence.
- Exploiter `recherches_populaires` au-delà des simples suggestions —
  data déjà collectée, valeur non captée.

---

## 09 — Reputation

Construire une réputation fiable suppose trois garde-fous déjà pointés
dans le brief, et l'état réel de chacun :

- **Jamais achetable** : vrai aujourd'hui — `moyenne_avis` vient
  uniquement des avis réels, `plan` n'a aucune influence dessus. À
  préserver explicitement quand la monétisation sera construite.
- **Traiter les faux avis / abus** : le système de signalement citoyen
  existe et vient d'être renforcé (Yelen arbitre, plus l'institution
  elle-même) — bonne base, mais rien de spécifique aux avis frauduleux
  (avis en masse, faux comptes) n'a été audité dans cette session — à
  creuser séparément avant de trop exposer les avis publiquement.
- **Score interne vs public** : `lib/reputationScore.ts` est un bon
  design (déterministe, pondéré, zéro LLM) — mais son isolement complet
  du citoyen est aujourd'hui une perte de valeur, pas une protection. Rien
  dans sa logique n'est sensible à exposer (délai de réponse, taux de
  résolution) — seule la décision produit de le montrer manque.

---

## 10 — Community

Rôle stratégique visé : construire la matière première de la confiance
professionnelle (expertise, activité réelle, réputation) — pas un réseau
social de plus.

État réel : bien exécuté pour ce qu'il couvre (modération réelle à double
mécanisme, identité vérifiée requise pour publier, catégories orientées
business), mais structurellement **coupé de la moitié du réseau qui
compte** — les organisations. Une institution ne peut pas y démontrer son
expertise, répondre publiquement, ou construire une présence de contenu.
C'est un espace « citoyen parle de business », pas encore « l'écosystème
Yelen discute ».

Piège à éviter en le corrigeant : ne pas transformer ça en flux
algorithmique généraliste avec follow/like infini façon LinkedIn complet
— la taille actuelle (petite, modérée, thématique) est une qualité, pas
une limite à corriger à tout prix. La bonne extension est ciblée :
permettre à une institution vérifiée de publier *en tant qu'organisation*
(pas en tant qu'individu), avec un lien visible vers sa fiche — pas un
fil d'actualité entreprise complet.

---

## 11 — Offers & Announcements

Rôle stratégique actuel : Offres = acquisition/marketing pour les
partenaires (fonctionne, mesuré). Annonces = communication directe
institution→citoyens déjà abonnés/clients (fonctionne, pas mesuré au-delà
des vues/likes/commentaires déjà trackés).

Ce qui manque pour que ce soit un vrai moteur de croissance plutôt qu'une
fonctionnalité isolée : aucune des deux n'est aujourd'hui un levier
d'acquisition de *nouvelles* organisations sur Yelen — elles servent des
organisations déjà présentes. Le partenariat (seul prérequis aux Offres)
est distribué manuellement par demande, pas positionné comme un objectif
naturel après un certain niveau de maturité de profil (ex. profil complet
+ vérifié → invitation automatique à devenir partenaire). C'est le lien
manquant entre la section 05 (vérification) et la section 11
(monétisation potentielle) : la vérification devrait être le prérequis
naturel du partenariat, pas deux processus complètement séparés comme
aujourd'hui.

---

## 12 — Network Effects

La boucle décrite dans le brief (plus d'organisations → plus
d'information fiable → plus d'utilité citoyen → plus de citoyens → plus
de visibilité organisation → plus d'organisations) est aujourd'hui
**ouverte à deux endroits précis** :

1. Entre *organisation présente* et *organisation qui compte vraiment* :
   rien ne distingue une fiche vide d'une fiche complète et vérifiée dans
   la découverte (section 08). Sans ce maillon, plus d'organisations ne
   crée pas plus de valeur perçue — juste plus de bruit.
2. Entre *utilité pour le citoyen* et *visibilité pour l'organisation* :
   la réputation construite par l'usage réel (ponctualité, réactivité,
   résolution de litiges) reste invisible côté citoyen (section 09). Sans
   ce maillon, une organisation qui se comporte bien n'en tire aucun
   avantage compétitif visible — donc aucune incitation supplémentaire à
   bien se comporter au-delà de l'éthique professionnelle seule.

Fermer ces deux maillons (vérification réelle + réputation visible +
ranking qui en tient compte) est ce qui transforme l'accumulation actuelle
de fonctionnalités en boucle auto-entretenue. C'est pourquoi ces deux
sujets sont classés P0 en section 17, avant toute nouvelle fonctionnalité
citoyen ou organisation.

---

## 13 — Business Model

| Reste gratuit | Peut devenir premium | Ne jamais monétiser |
|---|---|---|
| App citoyenne entière | Mise en avant/amplification (Offres boostées) | Le badge vérifié lui-même |
| Fiche organisation de base + réservation | Profondeur d'analytics (Centre d'analyse déjà riche en interne) | Le statut « validée » |
| Avis, signalements, arbitrage | Sièges d'équipe / capacité Clock In Shift au-delà d'un seuil | La position dans le classement de recherche |
| Vérification niveau 1 (profil complet, automatique) | Frais de dossier pour la revue humaine de vérification (le *processus*, jamais le *résultat*) | La suppression d'un avis négatif légitime |

Le seul vrai actif prêt à être testé commercialement aujourd'hui sans
construire de nouvelle infrastructure lourde : le Centre d'analyse
(données déjà calculées en interne, juste jamais packagées en offre
payante) et l'amplification des Offres (le tracking de clics existe
déjà). Tout le reste (facturation récurrente réelle, intégration mobile
money/Stripe) est une décision d'infrastructure de paiement à part
entière, pas une extension de code existant — à traiter comme un chantier
dédié, après que la vérification (section 05) et le ranking par mérite
(section 08) aient donné aux organisations une vraie raison de vouloir
plus.

---

## 14 — Product Risks

- **Confiance en façade** : lancer publiquement avec un badge « vérifié »
  qui ne vérifie rien est le risque le plus sérieux identifié dans cet
  audit — un seul cas médiatisé d'organisation frauduleuse « vérifiée »
  peut invalider durablement la marque de confiance.
- **Paiement cassé visible publiquement** : les boutons Stripe/PayPal
  désactivés sur une page accessible sont un signal de faiblesse pour une
  plateforme qui se positionne sur la confiance — à corriger (masquer ou
  finir) avant tout effort de communication sur le sujet paiement.
- **Sur-construction du côté institution, sous-construction du pont vers
  le citoyen** : 35 onglets côté institution vs. un lien quasi inexistant
  entre cette richesse et ce que le citoyen en voit. Continuer à ajouter
  des outils opérationnels sans connecter leur usage réel à la réputation
  publique creuse cet écart plutôt que de le combler.
- **Dérive de taxonomie qui se propage** : construire un ranking ou une
  facturation par plan sur les enums actuels (catégorie/secteur, plan)
  sans les unifier d'abord fige la dette dans des systèmes plus difficiles
  à corriger ensuite.
- **Tension vision long terme non résolue** : YelenID/Yelen Trust/Yelen
  Points sont documentés comme vision sans code, avec une tension déjà
  identifiée par l'équipe elle-même (score visible vs jamais de score
  citoyen visible) — construire dessus sans trancher explicitement risque
  de contredire un principe produit déjà assumé.

---

## 15 — Technical/Product Debt

À corriger avant de construire davantage dessus (pas des chantiers en
soi, des prérequis) :

- Unifier `category` (texte libre) et `secteur` (enum) — une seule source
  de vérité pour la taxonomie organisation.
- Aligner l'enum `plan` réellement utilisé dans le code
  (`gratuit`/`premium`) avec la nomenclature documentée
  (`essentiel`/`pro`/`entreprise`) — actuellement deux vérités
  différentes selon l'écran.
- Décider du sort de `niveau_confiance` (probablement la bonne colonne
  pour la vérification à paliers, section 05) et de `document_officiel`
  (colonne legacy déconnectée du vrai flux d'upload) — ne pas laisser du
  schéma silencieusement trompeur.
- Committer et déployer délibérément le travail non commité déjà présent
  (`LocationPicker.tsx`, champs lat/long dans `ProfilEntrepriseTab.tsx`) —
  actuellement une fonctionnalité invisible en prod alors que le code
  existe.
- Auditer systématiquement la couverture RLS citoyen sur les tables
  d'écriture — le bug trouvé et corrigé cette semaine (`rdv.avis_demande`
  jamais remis à jour parce que la policy RLS citoyen sur `rdv` est
  lecture seule, échec silencieux côté client) est exactement la classe
  de bug qui peut se reproduire ailleurs sans qu'aucune erreur ne soit
  jamais visible.

---

## 16 — Missing Capabilities

Des capacités structurelles absentes aujourd'hui — pas des écrans, des
briques :

1. **Revue de preuve** — un vrai flux admin pour examiner un document
   d'identité et décider valide/rejeté avec traçabilité (la table existe,
   l'écran n'existe pas).
2. **Ranking par mérite** — un algorithme de recherche qui pondère
   vérification, complétude, réactivité — pas seulement un tri client par
   note.
3. **Réputation exposée** — un sous-ensemble public-safe du score de
   santé interne, exprimé en faits plutôt qu'en chiffre composite.
4. **Identité organisationnelle dans Community** — publier en tant
   qu'institution vérifiée, pas seulement en tant que citoyen.
5. **Infrastructure de paiement réelle** — si/quand la décision est prise
   de la construire (hors périmètre immédiat, cf. section 13).
6. **Cycle de vie du badge** — octroi avec preuve, expiration,
   renouvellement, révocation — aujourd'hui uniquement « accordé/retiré »
   sans aucune notion de temps.

---

## 17 — Strategic Priorities

**P0 — Critique (bloque la promesse de confiance elle-même)**
- Connecter `documents_institution` à un vrai flux de revue admin ;
  conditionner `badge_verifie`/`statut='validee'` à cette revue plutôt
  qu'à un clic seul.
- Corriger la dérive de taxonomie (`category`/`secteur`, `plan`) —
  prérequis technique aux deux points suivants.
- Masquer ou finir les boutons de paiement cassés sur la page
  d'abonnement publique.

**P1 — Stratégique (ferme la boucle réseau)**
- Ranking de recherche pondéré par vérification/complétude/réactivité.
- Exposer un sous-ensemble factuel de la réputation institution au
  citoyen (pas le score composite interne tel quel).
- Cycle de vie du badge (expiration/renouvellement/révocation).

**P2 — Important (renforce sans débloquer)**
- Identité organisationnelle dans Yelen Community.
- Connecter le partenariat à un parcours naturel post-vérification plutôt
  qu'une demande manuelle isolée.
- Committer/déployer le travail géolocalisation déjà écrit, et l'afficher
  enfin sur la fiche publique.

**P3 — Plus tard (pas nécessaire avant lancement)**
- Toute infrastructure de facturation/paiement Yelen-side réelle.
- YelenSkills / réputation professionnelle Community.
- Personnalisation/algorithme de recommandation en recherche au-delà du
  ranking par mérite.

---

## 18 — Roadmap

**Maintenant (housekeeping, zéro nouveau périmètre utilisateur)**
Unifier les taxonomies, trancher les colonnes mortes, masquer les boutons
de paiement cassés, committer le travail géolocalisation en attente, faire
un audit RLS ciblé sur les tables d'écriture citoyen.

**Pré-lancement**
Construire l'écran de revue de preuve admin et connecter le badge à une
vraie vérification. Trancher explicitement la tension YelenID/Trust/Points
vs. « jamais de score citoyen visible » (décision écrite, pas du code) —
avant que quoi que ce soit ne soit construit dans cette direction.

**Lancement**
Ranking de recherche par mérite. Fiche publique institution affiche la
localisation réelle. Parcours naturel vérification → partenariat.

**12 mois**
Réputation institution exposée au citoyen sous forme de faits.
Identité organisationnelle dans Community (publication institution).
Premières expérimentations de monétisation légère (amplification Offres,
profondeur analytics) — jamais sur le badge ou le classement organique.

**24 mois / échelle régionale**
Infrastructure de paiement réelle si la demande marché le justifie
(mobile money d'abord, cohérent avec l'usage régional actuel plutôt que
Stripe/PayPal qui restent aujourd'hui non intégrés). Taxonomie
multi-pays. Yelen Skills, seulement si l'engagement Community le
justifie par les données, pas par anticipation.
