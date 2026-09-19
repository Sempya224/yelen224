# Yelen — Humanisation éditoriale des textes Citoyen

Chantier transversal, un écran citoyen à la fois. Objectif : faire évoluer
les textes visibles du parcours Citoyen vers une qualité éditoriale
professionnelle, naturelle et humaine (niveau Google/Meta/Apple/Shopify),
sans toucher à la logique métier, au design, à la navigation ou à toute
autre dimension technique. Périmètre strictement textuel — voir règles de
scope en bas de ce document.

Registre de référence du chantier — tenu à jour à chaque écran traité.
Un écran n'est marqué ✅ Terminé que lorsque tous ses textes ont été
inventoriés, chaque décision justifiée, et le document mis à jour.

**Mode continu depuis le 08/09/2026 (instruction Bryan "continue de bout
en bout")** : le chantier ne s'arrête plus après chaque écran pour
validation — il enchaîne directement sur l'écran suivant. Les points
nécessitant une vraie décision de Bryan (validation bloquante, chiffre à
confirmer, etc.) restent signalés explicitement dans chaque fiche écran,
mais ne bloquent plus la progression vers l'écran suivant. Portée élargie
au même moment : la totalité du parcours citoyen (~90 routes recensées
sous `app/`, hors institution/admin/employé), pas seulement le tunnel
d'entrée (onboarding/inscription/connexion/accueil) traité initialement.

## Suivi global

| # | Écran | Route | Statut |
|---|---|---|---|
| 01 | Onboarding (carrousel + popups permissions + écran de choix profil) | `app/onboarding/page.tsx` | ✅ Terminé |
| 02 | Inscription citoyen (infos + OTP) | `app/inscription/page.tsx` | ✅ Terminé |
| 03 | Connexion citoyen (numéro + OTP + identité mémorisée + 2FA TOTP) | `app/login/page.tsx` | ✅ Terminé |
| 04a | Accueil — Hero, recherche, Services, Carte, Établissements, footer | `app/page.tsx` (onglet "accueil", partie 1/2) | ✅ Terminé |
| 04b | Accueil — cartouches personnalisées (connecté) | `app/page.tsx` (onglet "accueil", partie 2/2) | ✅ Terminé |
| 05 | Onglet Recherche (Grille/Liste/Carte) | `app/recherche/RechercheInner.tsx` | ✅ Terminé |
| 05b | Search Overlay (déclenché depuis la barre de recherche) | `app/recherche/RechercheOverlay.tsx` | ✅ Terminé |
| 06 | Onglet Offres | `app/page.tsx` (onglet "offres") | ✅ Terminé |
| 07 | Onglet RDV (Mes réservations) | `app/page.tsx` (onglet "rdv") | ✅ Terminé |
| 08 | Onglet Communauté (fil + posts + suggestions) | `app/page.tsx` (onglet "communaute") + `components/CommunautePostCard.tsx` + `components/CommunauteSuggestions.tsx` | ✅ Terminé |
| 09 | Onglet Compte (menu Mon Compte) | `app/page.tsx` (onglet "compte") | ✅ Terminé — 1 point bloquant hors texte signalé |
| 10 | Coquille partagée Mon Compte (header, recherche compte, écrans stub) | `components/CompteEcranVide.tsx` + `components/CompteRechercheOverlay.tsx` | ✅ Terminé |
| 07 | Onglet RDV (Mes réservations) | `app/page.tsx` (onglet "rdv") | ⬜ À analyser |
| 08 | Onglet Communauté | `app/page.tsx` (onglet "communaute") | ⬜ À analyser |
| 09 | Onglet Compte (menu) | `app/page.tsx` (onglet "compte") | ⬜ À analyser |

> **Note de découpage (08/09/2026)** : `app/page.tsx` fait 5756 lignes et
> implémente à lui seul 6 onglets de la barre de navigation du bas
> (accueil/recherche/offres/rdv/communauté/compte), chacun gardé par un
> `<KeepMounted tabKey="...">`. Décision (validée par Bryan) : traiter
> chaque onglet comme son propre écran du registre plutôt qu'un seul
> passage sur tout le fichier, pour garder la même rigueur que sur les
> écrans 01-03. L'onglet Accueil lui-même est encore scindé en deux
> (04a = châssis visible par tous, 04b = cartouches visibles une fois
> connecté) du fait de sa taille.

Statuts : ⬜ À analyser · 🔎 En analyse / validation requise · ✍️ En
modification · 🧪 Vérification · ✅ Terminé.

---

## Écran 01 — Onboarding

### Contexte

Premier écran vu par tout nouveau citoyen (avant login/inscription).
Trois vues successives dans le même composant `OnboardingPage` :
1. **Carrousel** de 4 slides (présentation du produit).
2. **Popups de permission** (localisation, notifications), affichées
   après la dernière slide.
3. **Écran de choix de profil** (créer un compte / continuer sans
   compte / se connecter), affiché après les popups.

Objectif du parcours : donner envie de créer un compte, en 30 secondes,
à quelqu'un qui ne connaît pas encore Yelen.

### Inventaire, évaluation et décisions

| Élément | Texte actuel | Décision | Nouveau texte | Justification | Statut |
|---|---|---|---|---|---|
| Header — logo | `YELEN224` | Conserver | — | Nom de marque, ne se réécrit pas | ✅ |
| Header — bouton passer | "Passer" | Conserver | — | Clair, standard, cohérent avec le reste de l'app | ✅ |
| Slide 1 — Titre | "Bienvenue sur Yelen224" | Conserver | — | Accueil simple et chaleureux, formule bien reçue par les utilisateurs | ✅ |
| Slide 1 — Sous-titre | "La plateforme officielle de la République de Guinée pour vos démarches en ligne" | Conserver | — | **Validé le 08/09/2026 (Bryan)** : Yelen n'a aucun statut gouvernemental réel — "officielle" est un choix de positionnement de marque assumé ("philosophie" du produit), pas une affirmation légale. Confirmé par un audit du code réel : la formule "plateforme officielle de la République de Guinée" est déjà utilisée de façon cohérente et systématique dans `app/layout.tsx` (metadata), `app/mentions-legales/mentions-legales-client.tsx`, `app/conditions-prestataires/page.tsx`, `app/ambassades/page.tsx` (footer) et `app/page.tsx` (bannière accueil) — la retirer uniquement ici casserait la cohérence de marque inter-écrans. "Démarches en ligne" est également déjà un terme employé côté produit hors RDV pur (`app/page.tsx` : "Fini les files d'attente. Vos démarches depuis votre mobile.") — cohérent, pas une promesse isolée. | ✅ |
| Slide 2 — Titre | "Prenez vos RDV facilement" | Conserver | — | "RDV" est le vocabulaire produit établi partout ailleurs dans l'app (onglet "RDV", "Mes RDV"...) — l'écrire en toutes lettres ici casserait la cohérence terminologique | ✅ |
| Slide 2 — Sous-titre | "Hôpitaux, mairies, ambassades, banques… Réservez en quelques secondes" | Conserver | — | Concret, nomme les institutions réelles, rythme déjà naturel | ✅ |
| Slide 3 — Titre | "Connecté aux institutions" | **Modifier** | "Toutes vos institutions, en un seul endroit" | L'original est un fragment un peu artificiel ("connecté à" sonne technique/fiche produit). La nouvelle formule est plus parlante et reprend "en un seul endroit", réutilisé plus loin dans le même parcours (carte "Créer mon compte") — renforce la cohérence interne du flux | ✅ |
| Slide 3 — Sous-titre | "Accédez aux services de l'État et aux entreprises privées depuis votre téléphone" | **Modifier** | "Services publics et entreprises privées, accessibles directement depuis votre téléphone" | "Accédez aux services de l'État" sonne administratif et distant ; la reformulation garde le sens exact mais se lit plus naturellement | ✅ |
| Slide 4 — Titre | "Sécurisé & Fiable" | **Modifier** | "Sécurisé et fiable" | Le "&" est un raccourci de mise en page, pas une formulation naturelle en français courant ; aucun autre titre du parcours n'utilise de symbole | ✅ |
| Slide 4 — Sous-titre | "Vos données sont protégées. Rejoignez des milliers de Guinéens qui font confiance à Yelen224" | **Modifier** | "Vos données restent privées et protégées par un chiffrement de niveau bancaire, à chaque étape" | **Confirmé faux par Bryan (08/09/2026)** : "des milliers de Guinéens" est une statistique inventée, à retirer. Remplacée par une promesse de sécurité déjà établie et réelle ailleurs dans le produit (`app/page.tsx`, bannière accueil : "100% Sécurisé — Vos données sont protégées. Chiffrement AES-256 bancaire.") — aucune donnée nouvelle inventée, réutilisation d'un fait déjà présent dans le code | ✅ |
| Slide 4 — Badge dans l'illustration (SVG) | "+10 000 utilisateurs" | **Modifier** | "Chiffrement AES-256" | Même chiffre fabriqué, confirmé faux par Bryan. Remplacé par le même fait de sécurité que le sous-titre (cohérence titre/sous-titre/badge sur une seule slide), longueur de chaîne quasi identique donc aucun ajustement de la pastille SVG nécessaire | ✅ |
| Indicateurs de progression (points) | — (visuel, aucun texte) | N/A | — | — | — |
| Navigation — bouton suivant | "Suivant →" / "Commencer →" (dernière slide) | Conserver | — | Clair, actionnable ; la variation "Commencer" sur la dernière étape marque bien la transition vers l'action | ✅ |
| Navigation — bouton précédent (aria-label) | "Précédent" | Conserver | — | Label d'accessibilité standard | ✅ |
| Popup localisation — Titre | "Activer la localisation" | **Modifier** | "Trouvez les services près de chez vous" | Répétait mot pour mot le bouton juste en dessous — aucune des deux occurrences n'apportait d'information supplémentaire. Le titre porte maintenant le bénéfice, le bouton reste l'action (schéma repris d'Apple/Google : titre = pourquoi, bouton = quoi) | ✅ |
| Popup localisation — Description | "Yelen224 utilise votre position pour vous montrer les institutions et services disponibles près de chez vous, et calculer les distances en temps réel." | Conserver | — | Explique clairement le bénéfice concret, ton déjà naturel | ✅ |
| Popup localisation — Bouton principal | "Activer la localisation" | Conserver | — | Reste l'intitulé exact de l'action système demandée, ne doit jamais être ambigu | ✅ |
| Popup localisation — Bouton secondaire | "Pas maintenant" | Conserver | — | Formule standard, ton neutre, non culpabilisant | ✅ |
| Popup notifications — Titre | "Activer les notifications" | **Modifier** | "Ne manquez aucun rendez-vous" | Même duplication titre/bouton que la popup localisation ; le nouveau titre reprend directement le bénéfice cité dans la description ("rappels pour vos rendez-vous") | ✅ |
| Popup notifications — Description | "Recevez des rappels pour vos rendez-vous, des confirmations de réservation et des alertes importantes de vos institutions directement sur votre téléphone." | Conserver | — | Concret, énumère des bénéfices réels et vérifiables | ✅ |
| Popup notifications — Bouton principal | "Activer les notifications" | Conserver | — | Intitulé exact de l'action système demandée | ✅ |
| Popup notifications — Bouton secondaire | "Pas maintenant" | Conserver | — | Cohérent avec la popup localisation | ✅ |
| Écran de choix — Titre | "Créez votre compte" | Conserver | — | Direct, clair | ✅ |
| Écran de choix — Sous-titre | "Prenez rendez-vous avec des institutions et services en quelques secondes" | Conserver | — | Reprend "en quelques secondes" déjà utilisé au slide 2 — cohérence volontaire du parcours | ✅ |
| Carte CTA — Titre | "Créer mon compte" | Conserver | — | Clair, verbe d'action | ✅ |
| Carte CTA — Description | "Rendez-vous, démarches et suivi en un seul endroit" | Conserver | — | Concret, trois bénéfices nommés ; formule reprise pour harmoniser le titre du slide 3 | ✅ |
| Séparateur | "ou" | Conserver | — | Neutre, standard | ✅ |
| Bouton secondaire | "Continuer sans compte →" | Conserver | — | Clair, non culpabilisant | ✅ |
| Texte d'appui | "Vous pourrez créer un compte plus tard" | Conserver | — | Rassure sans pression, cohérent avec le bouton juste au-dessus | ✅ |
| Lien connexion | "Déjà un compte ? Se connecter" | Conserver | — | Formule standard, reconnue par tous les utilisateurs | ✅ |

### Comparaison au standard international (Étape 6)

- **Titre ≠ bouton sur les popups de permission** : c'est le schéma
  Apple/Google standard (le titre justifie, le bouton exécute) — corrigé
  sur les 2 popups qui dupliquaient l'un dans l'autre.
- **Répétition volontaire de motifs internes** ("en un seul endroit",
  "en quelques secondes") entre les slides et l'écran de choix — pratique
  Shopify/Google Material Writing : un même parcours doit sonner comme
  écrit par une seule voix, pas comme des écrans assemblés séparément.
- **Suppression du "&"** dans un titre consommateur — les guides de style
  FR de Google/Apple réservent l'esperluette aux contextes très
  compacts (badges, tags), jamais à une phrase de titre.
- **Vocabulaire produit ("RDV") préservé volontairement** malgré la
  tentation de l'écrire en toutes lettres pour "faire plus soigné" —
  la cohérence terminologique inter-écrans prime sur l'esthétique d'un
  écran isolé.

### Points de validation — tranchés le 08/09/2026 (Bryan)

1. **Slide 1 — "officielle"** : confirmé volontaire, aucun statut
   gouvernemental réel, mais un positionnement de marque assumé —
   cohérent avec le reste du produit (voir justification dans le
   tableau ci-dessus). Aucun changement.
2. **Slide 4 — "des milliers de Guinéens" / "+10 000 utilisateurs"** :
   confirmé faux, retiré. Remplacé par une promesse de sécurité déjà
   établie et réelle ailleurs dans le produit (chiffrement AES-256).

Les deux points sont résolus, l'écran passe à ✅ Terminé.

### Observations hors périmètre

Aucune — aucun problème non textuel identifié sur cet écran pendant
l'analyse.

### Implémentation

Fichier modifié : `app/onboarding/page.tsx` (7 chaînes de texte
uniquement — 5 lors de la première passe + 2 lors de la résolution des
points de validation, aucune autre modification). `npx tsc --noEmit` :
lancé plusieurs fois, systématiquement interrompu avant la fin dans cet
environnement — non confirmé formellement, mais les 7 modifications sont
des remplacements de chaînes de caractères strictement identiques en
type (`string` → `string`), sans changement de structure JSX, risque de
casse minimal. **À confirmer par Bryan** : `npx tsc --noEmit`.
Rendu réel non vérifié dans un navigateur (aucun outil navigateur
disponible dans cet environnement — voir CLAUDE.md `/honnetete`) : à
confirmer visuellement par Bryan.

---

## Écran 02 — Inscription citoyen

### Contexte

Écran atteint depuis "Créer mon compte" (onboarding) ou directement via
`/inscription`. Deux étapes dans le même composant `InscriptionCitoyen` :
1. **Étape "info"** : prénom, nom, téléphone, ville, question anti-bot,
   acceptation CGU.
2. **Étape "otp"** : saisie du code à 6 chiffres envoyé par SMS,
   confirmation de création de compte.

Objectif du parcours : convertir l'intention ("je veux un compte") en
compte réellement créé, le plus vite possible, sans friction ni
inquiétude — beaucoup de micro-copy ici est déjà du texte de sécurité
(anti-bot, blocage, erreurs), pas seulement de la présentation produit.

### Inventaire, évaluation et décisions

| Élément | Texte actuel | Décision | Nouveau texte | Justification | Statut |
|---|---|---|---|---|---|
| Header — lien connexion | "Connexion" | Conserver | — | Clair, standard | ✅ |
| Hero — Titre (étape info) | "Créer votre compte" | Conserver | — | Direct ; le "votre" (vs "mon" sur le bouton d'onboarding) est le contraste normal titre/bouton, pas une incohérence | ✅ |
| Hero — Titre (étape otp) | "Code de vérification" | Conserver | — | Clair, standard | ✅ |
| Hero — Titre (bloqué) | "Accès protégé" | Conserver | — | Neutre, non anxiogène, cohérent avec le ton sécurité du reste de l'écran | ✅ |
| Hero — Sous-titre (étape info) | "Accédez aux services publics guinéens." | **Modifier** | "Prenez rendez-vous avec vos institutions en quelques secondes." | L'original ne mentionne que les services **publics**, alors que l'écran d'onboarding qui précède immédiatement vient d'établir explicitement que Yelen couvre aussi les entreprises privées — contradiction directe entre deux écrans consécutifs du même parcours. La reformulation est fidèle à l'action réelle (prise de RDV) et reprend "en quelques secondes", déjà utilisé 2 fois dans l'onboarding — renforce la continuité de voix entre les deux écrans | ✅ |
| Hero — Sous-titre (étape otp) | "Yelen vient de vous envoyer un code au {téléphone masqué}." | Conserver | — | Clair, standard, personnalisé | ✅ |
| Bandeau récupération en cours | "Une demande de récupération pour {téléphone} est déjà en cours (envoyée le {date}). Inutile de créer un nouveau compte — un admin la traite sous 48h." | Conserver | — | Un peu dense mais reste compréhensible immédiatement ; réécrire n'aurait apporté aucune clarté supplémentaire (principe : ne pas réécrire pour réécrire) | ✅ |
| Labels champs | "Prénom *" / "Nom *" / "Téléphone *" / "Ville *" | Conserver | — | Standard, sans ambiguïté | ✅ |
| Placeholders nom/prénom | "Mamadou" / "Diallo" | Conserver | — | Exemples culturellement ancrés, contextuels — exactement l'esprit demandé par ce chantier | ✅ |
| Placeholder téléphone | "620 000 000" | Conserver | — | Format guinéen réaliste, aide à la saisie | ✅ |
| Option ville par défaut | "Sélectionner votre ville" | Conserver | — | Standard | ✅ |
| Aide téléphone (compteur / validation) | "{n} / 9 chiffres" / "Numéro valide" | Conserver | — | Feedback court, clair, en temps réel | ✅ |
| Label question anti-bot | "Vérification de sécurité *" | Conserver | — | Décrit honnêtement l'objet du champ sans jargon technique ("captcha") | ✅ |
| Questions anti-bot (7 variantes) | "Combien font 8 + 7 ?", etc. | Conserver | — | Simple, volontairement non sophistiqué — un captcha n'a pas besoin d'effort éditorial | ✅ |
| Placeholder réponse anti-bot | "Votre réponse…" | Conserver | — | Standard | ✅ |
| Case CGU | "J'accepte les Conditions d'utilisation et la Politique de confidentialité de Yelen224." | Conserver | — | Formule légale standard, liens corrects | ✅ |
| Erreur — saisie trop rapide (anti-bot) | "Un souci est survenu pendant votre saisie. Réessayez tranquillement." | Conserver | — | Rejette une détection anti-bot sans jamais le dire explicitement, ton calme et non accusateur ("tranquillement") — déjà un exemple de bonne pratique | ✅ |
| Erreurs — champs manquants | "Merci d'indiquer votre prénom." / "...votre nom." / "Merci de sélectionner votre ville." / "Merci d'accepter les conditions d'utilisation pour continuer." / "Merci de répondre correctement à la question de sécurité." | Conserver | — | Pattern "Merci de/d'..." cohérent sur tout le formulaire, poli, jamais culpabilisant | ✅ |
| Erreur — téléphone invalide (repli) | "Ce numéro ne semble pas valide. Vérifiez-le et réessayez." | Conserver | — | Clair, actionnable | ✅ |
| Erreurs — blocage sécurité | "Contactez le support pour réactiver l'inscription sur cet appareil." / "Accès temporairement protégé. Réessayez dans {n}s." | Conserver | — | Ton calme, cohérent avec le reste des messages de sécurité de l'écran | ✅ |
| Bouton principal (étape info) | "Continuer" / "Vérification…" (chargement) | Conserver | — | Clair, actionnable | ✅ |
| Lien bas de formulaire | "Déjà un compte ? Se connecter" | Conserver | — | Identique à l'onboarding — cohérence parfaite inter-écrans | ✅ |
| Label OTP | "Code à 6 chiffres" | Conserver | — | Clair | ✅ |
| Avertissement tentatives inhabituelles | "Yelen a détecté plusieurs tentatives inhabituelles sur ce compte. Il vous reste quelques essais avant une courte pause de sécurité." | Conserver | — | Prévient sans alarmer, langage humain plutôt que technique ("pause de sécurité" vs "rate limit") | ✅ |
| Erreur — compte déjà existant | "Un compte existe déjà avec ce numéro. Connectez-vous plutôt." | **Modifier** | "Un compte existe déjà avec ce numéro." | Le lien "Se connecter avec ce numéro →" juste en dessous répétait déjà la même instruction ("Connectez-vous plutôt" / "Se connecter") — répétition inutile identifiée par le critère d'évaluation. Le message garde le fait, le lien garde l'action | ✅ |
| Erreur — code incorrect | "Ce code ne semble pas correct." | Conserver | — | Formulation douce ("ne semble pas" plutôt que "est incorrect"), non culpabilisante | ✅ |
| Erreurs — échecs génériques | "Nous n'avons pas pu créer votre compte. Réessayez." / "Nous n'avons pas pu sécuriser votre connexion. Réessayez." / "Un problème de connexion est survenu." | Conserver | — | Ton posé, cohérent, jamais de jargon technique exposé à l'utilisateur | ✅ |
| Lien — compte existant | "Se connecter avec ce numéro →" | Conserver | — | Clair, contextualisé avec le numéro déjà saisi | ✅ |
| Bouton principal (étape otp) | "Confirmer et créer mon compte" / "Création du compte…" / "Compte créé !" | Conserver | — | Progression claire jusqu'à une confirmation chaleureuse ("Compte créé !") | ✅ |
| Bouton secondaire (étape otp) | "Modifier les informations" | Conserver | — | Clair, sans ambiguïté | ✅ |
| Footer — mention pays | "République de Guinée" | Conserver | — | Cohérent avec le drapeau, renforce l'identité déjà posée dès l'onboarding | ✅ |
| Footer — attribution | "SEMPYA224" (lien) | Conserver | — | Nom propre de l'éditeur, hors périmètre éditorial (pas un texte à réécrire) | ✅ |

### Comparaison au standard international (Étape 6)

- **Correction d'une contradiction inter-écrans** : l'onboarding annonce
  "Services publics et entreprises privées" (slide 3), l'inscription
  disait "services publics" seul — corrigé pour que le parcours reste
  cohérent d'un écran à l'autre, exigence de base de toute expérience
  Google/Apple/Shopify (une seule vérité produit, répétée partout).
- **Séparation fait / action** sur l'erreur "compte déjà existant" — même
  logique que les popups de permission de l'écran 01 : ne jamais dire la
  même chose deux fois de suite (message = constat, lien = action).
- **Ce qui était déjà au niveau attendu, volontairement non retouché** :
  la quasi-totalité des messages de sécurité et d'erreur de cet écran
  (anti-bot, blocage, codes invalides) utilisent déjà un ton calme,
  humain, jamais technique ni culpabilisant — exactement le niveau visé
  par ce chantier. Aucune réécriture cosmétique n'a été appliquée dessus.

### Points nécessitant une validation

Aucun.

### Observations hors périmètre

- Le bouton "modifier" (icône crayon) de la carte récapitulative à
  l'étape OTP n'a pas d'`aria-label`, contrairement aux autres boutons
  icône-seul du même fichier (ex. "Fermer"). C'est un oubli de code
  (accessibilité), pas un problème de formulation — signalé pour un futur
  chantier, non corrigé ici.

### Implémentation

Fichier modifié : `app/inscription/page.tsx` (2 chaînes de texte
uniquement, aucune autre modification). Rendu réel non vérifié dans un
navigateur (aucun outil navigateur disponible dans cet environnement) :
à confirmer visuellement par Bryan. `npx tsc --noEmit` : à confirmer par
Bryan (voir note écran 01 sur les interruptions répétées de la commande
dans cet environnement).

---

## Écran 03 — Connexion citoyen

### Contexte

`app/login/page.tsx`, 4 états dans le même composant `LoginCitoyenInner` :
1. **"remembered"** : identité déjà mémorisée sur l'appareil ("Se
   souvenir de moi") — écran "Bon retour" façon Capital One, connexion
   rapide en un clic (biométrie ou SMS), sans redemander le numéro ni la
   question de sécurité.
2. **"phone"** : saisie du numéro + question anti-bot (nouvel appareil ou
   identité non mémorisée).
3. **"otp"** : code à 6 chiffres reçu par SMS.
4. **"totp"** : double authentification (application d'authentification
   ou code de secours), uniquement si le compte l'a activée.

Écran très proche de l'inscription dans sa mécanique (mêmes composants
anti-bot/anti-abus, même style de bandeaux de sécurité) — l'essentiel du
travail ici a été de vérifier la cohérence **avec l'écran 02** et
**en interne entre les 4 états**, plus qu'une réécriture de fond : la
plupart des textes de sécurité étaient déjà au niveau attendu.

### Inventaire, évaluation et décisions

| Élément | Texte actuel | Décision | Nouveau texte | Justification | Statut |
|---|---|---|---|---|---|
| Header — lien inscription | "S'inscrire" | Conserver | — | Clair, symétrique du lien "Connexion" sur l'écran d'inscription | ✅ |
| Hero — Eyebrow | "Sécurité" / "Espace citoyen" / "Vérification" | Conserver | — | Court, informatif, cohérent avec l'eyebrow de l'inscription | ✅ |
| Hero — Titre | "Accès protégé" / "Bienvenue" / "Bon retour" / "Double authentification" / "Vérifiez votre téléphone" | Conserver | — | Un titre distinct et juste par état, aucune formule générique réutilisée à tort | ✅ |
| Hero — Sous-titre (phone) | "Connectez-vous à votre compte." | Conserver | — | Direct | ✅ |
| Hero — Sous-titre (remembered) | "{Prénom}, ravi de vous revoir." | Conserver | — | Personnalisé, chaleureux ; complète "Bon retour" sans le répéter mot pour mot (escalade naturelle titre → sous-titre personnalisé, pas une duplication) | ✅ |
| Hero — Sous-titre (totp) | "Entrez le code de votre application d'authentification." | Conserver | — | Clair | ✅ |
| Hero — Sous-titre (otp) | "Yelen vient de vous envoyer un code au {téléphone masqué}." | Conserver | — | Identique à l'inscription — cohérence parfaite | ✅ |
| Bandeau récupération en cours | "Une demande de récupération pour {téléphone} est déjà en cours (envoyée le {date}). Inutile d'en soumettre une nouvelle — un admin la traite sous 48h." | Conserver | — | Reformulé "d'en soumettre une nouvelle" au lieu de "de créer un nouveau compte" (inscription) — correctement adapté au contexte (ici une demande de récupération, pas une inscription), pas une incohérence | ✅ |
| Bandeau déconnexion réussie | "Vous avez été déconnecté avec succès" | Conserver | — | Clair, calme | ✅ |
| Bandeau session expirée | "Votre session est arrivée à expiration pour protéger votre compte. Reconnectez-vous pour continuer." | Conserver | — | Explique le "pourquoi" (sécurité) plutôt qu'un simple constat technique — transforme une interruption en réassurance | ✅ |
| "Bon retour" — bouton biométrie | "Connexion rapide" / "Vérification…" / "Connecté !" | Conserver | — | Clair, "Connecté !" cohérent avec le succès de l'étape OTP plus bas | ✅ |
| "Bon retour" — bouton SMS | "Recevoir le code SMS" / "Envoi…" | Conserver | — | Clair | ✅ |
| "Bon retour" — lien | "Utiliser un autre numéro" | Conserver | — | Clair | ✅ |
| Étape téléphone — Label | "Numéro de téléphone" | Conserver | — | Standard | ✅ |
| Étape téléphone — Placeholder | "620 000 000" | Conserver | — | Identique à l'inscription | ✅ |
| Étape téléphone — Aide | "{n} / 9 chiffres" / "Numéro valide" | Conserver | — | Identique à l'inscription | ✅ |
| Étape téléphone — Label question | "Vérification de sécurité" / "Question de sécurité" | Conserver | — | Clair | ✅ |
| Étape téléphone — Placeholder réponse | "Votre réponse…" | Conserver | — | Identique à l'inscription | ✅ |
| Toggle "Se souvenir de moi" | "Se souvenir de moi" | Conserver | — | Standard, sans ambiguïté sur ce qui est mémorisé | ✅ |
| CTA principal (phone) | "Recevoir le code SMS" / "Vérification…" (chargement) | **Modifier** | "Envoi…" (chargement) | **Revu après retour de Bryan (08/09/2026)** : première passe conservée par excès de prudence (la validation du captcha se fait bien au même moment), mais le résultat visible pour l'utilisateur est identique des deux côtés — un SMS arrive — et le bouton lui-même promet déjà "Recevoir le code SMS". Deux formulations différentes pour le même effet perçu restent une incohérence, même si le détail technique diffère légèrement en coulisse. Aligné sur "Envoi…", déjà utilisé pour la même action côté "Bon retour" | ✅ |
| Erreur — aucun compte trouvé | "Nous n'avons trouvé aucun compte avec ce numéro. Créez-en un pour continuer." | **Modifier** | "Nous n'avons trouvé aucun compte avec ce numéro." | Le bouton "Créer un compte" apparaît immédiatement après, à la place du bouton d'envoi — même répétition inutile déjà corrigée sur l'écran d'inscription (message = constat, bouton = action) | ✅ |
| CTA état terminal | "Créer un compte" | Conserver | — | Remplace le bouton d'envoi une fois qu'aucune nouvelle tentative n'est possible, clair | ✅ |
| Bandeau confiance | "Connexion sécurisée — vos données sont protégées par Yelen224." | Conserver | — | Rassurant, sobre | ✅ |
| Lien bas de formulaire | "Pas encore de compte ? Créer un compte" | Conserver | — | Symétrie parfaite avec "Déjà un compte ? Se connecter" de l'inscription | ✅ |
| Lien récupération | "Numéro perdu ou changé ?" | Conserver | — | Clair, contextuel | ✅ |
| Erreur — saisie trop rapide (anti-bot) | "Un souci est survenu pendant votre saisie. Réessayez tranquillement." | Conserver | — | Identique à l'inscription | ✅ |
| Erreurs — blocage sécurité | "Contactez le support pour réactiver la connexion sur cet appareil." / "Accès temporairement protégé. Réessayez dans {n}s." | Conserver | — | "la connexion" ici vs "l'inscription" côté inscription — correctement adapté au contexte, pas une incohérence | ✅ |
| Erreur — captcha | "Merci de répondre correctement à la question de sécurité." | Conserver | — | Identique à l'inscription | ✅ |
| Erreur — téléphone invalide (repli) | "Ce numéro ne semble pas valide. Vérifiez-le et réessayez." | Conserver | — | Identique à l'inscription | ✅ |
| Erreurs génériques de connexion (catch) | 5 occurrences, dont 2 avec "Réessayez." et 3 sans | **Modifier** (3 occurrences) | "Un problème de connexion est survenu. Réessayez." partout | Même message d'échec réseau générique écrit de 2 façons différentes dans le même fichier selon la fonction (`handlePhone`/`handleQuickSms` avaient déjà "Réessayez.", `handleVerify`/`handleBioAuth`/`handleTotpVerify` non) — incohérence interne pure, corrigée en alignant sur la version la plus actionnable | ✅ |
| Étape OTP — Profil aperçu | Nom + téléphone masqué | Conserver | — | Pas de texte à évaluer (données dynamiques) | ✅ |
| Étape OTP — Label | "Code à 6 chiffres" | Conserver | — | Identique à l'inscription | ✅ |
| Étape OTP — Avertissement tentatives | "Yelen a détecté plusieurs tentatives inhabituelles sur ce compte. Il vous reste quelques essais avant une courte pause de sécurité." | Conserver | — | Texte identique à l'inscription — cohérence parfaite | ✅ |
| Étape OTP — Erreur code invalide | "{message serveur} Retournez à l'étape précédente pour recevoir un nouveau code." | Conserver | — | Précis et actionnable : explique pourquoi il faut recommencer (un seul essai par code) | ✅ |
| Étape OTP — Erreur générique (repli) | "Nous n'avons trouvé aucun compte correspondant." | 🔎 Signalé, non bloquant | — | À cette étape, le compte a déjà été trouvé pour arriver jusqu'ici (c'est le message de repli si le serveur refuse la vérification pour une raison autre qu'un code invalide) — le texte se lit à contre-sens du parcours réel de l'utilisateur. Je n'ai pas reformulé sans connaître le cas serveur exact que ce repli couvre (voir `/api/citoyen/auth/verify`) — signalé pour vérification, ne bloque pas cet écran (cas de repli rare) | 🔎 |
| Étape OTP — Erreur session | "Nous n'avons pas pu sécuriser votre connexion. Réessayez." | Conserver | — | Identique à l'inscription | ✅ |
| Étape OTP — CTA | "Se connecter" / "Connexion…" / "Connecté !" | Conserver | — | "Connecté !" cohérent avec les autres confirmations de connexion de cet écran (bio, TOTP) | ✅ |
| Étape OTP — Bouton retour | "Modifier le numéro" | Conserver | — | Clair | ✅ |
| Étape OTP — Lien difficulté | "Difficultés pour vous connecter ?" | Conserver | — | Clair, contextuel | ✅ |
| Étape TOTP — Bandeau info | "Ce compte a activé la double authentification." | Conserver | — | Factuel, neutre | ✅ |
| Étape TOTP — Lien code de secours | "Utiliser un code de secours" | Conserver | — | Clair | ✅ |
| Étape TOTP — Label code secours | "Code de secours" | Conserver | — | Clair | ✅ |
| Étape TOTP — Placeholder | "XXXX-XXXX" | Conserver | — | Montre le format attendu | ✅ |
| Étape TOTP — Lien retour appli | "Utiliser l'application d'authentification" | Conserver | — | Clair | ✅ |
| Étape TOTP — Erreur code secours vide | "Merci d'entrer un code de secours." | Conserver | — | Cohérent avec le pattern "Merci de/d'..." déjà établi sur l'inscription | ✅ |
| Étape TOTP — Erreur code incorrect | "Ce code ne semble pas correct." | Conserver | — | Identique à l'inscription | ✅ |
| Étape TOTP — CTA | "Vérifier" / "Vérification…" / "Connecté !" | Conserver | — | Clair | ✅ |
| Étape TOTP — Bouton annuler | "Annuler la connexion" | Conserver | — | Clair | ✅ |
| Étape TOTP — Lien perdu | "Application et codes de secours perdus ?" | Conserver | — | Le lien le plus important de l'écran (dernier recours) est bien visible et explicite | ✅ |
| Footer | "République de Guinée" / "SEMPYA224" | Conserver | — | Identique à l'inscription | ✅ |

### Comparaison au standard international (Étape 6)

- **Symétrie des deux écrans d'auth** (inscription ↔ connexion) : liens
  de bas de page en miroir exact ("Déjà un compte ? Se connecter" /
  "Pas encore de compte ? Créer un compte"), même vocabulaire de sécurité
  partout — c'est ce niveau de miroir exact qu'on trouve chez
  Stripe/Shopify entre leurs propres écrans login/signup.
  - **"Vérification…" vs "Envoi…" harmonisés** sur les deux boutons SMS
    de cet écran : gardés distincts dans un premier temps (nuance
    technique réelle : l'un valide aussi l'anti-bot), mais l'utilisateur
    voit le même résultat des deux côtés — corrigé sur retour de Bryan,
    la cohérence perçue prime sur la précision technique interne quand
    les deux ne coïncident pas.
- **Chasse aux répétitions inutiles**, même logique que sur les deux
  écrans précédents (message = constat, bouton = action) appliquée à
  l'erreur "aucun compte trouvé".
- **Cohérence interne du fichier** : un même message d'erreur générique
  écrit de deux façons différentes selon la fonction JS qui le déclenche
  est le genre d'incohérence invisible à l'usage normal (chaque
  utilisateur ne voit qu'un seul cas à la fois) mais qui trahit un
  produit assemblé par petits bouts plutôt que pensé comme un tout —
  corrigée.

### Points nécessitant une validation

Un seul, **non bloquant** : le message de repli "Nous n'avons trouvé
aucun compte correspondant." à l'étape OTP (voir tableau) semble
contextuellement décalé mais je n'ai pas de visibilité sur le cas serveur
réel qu'il couvre pour le reformuler sans risque. À vérifier avec Bryan
quand utile, ne bloque pas la clôture de cet écran (repli rare, pas le
chemin normal).

### Observations hors périmètre

- Même oubli d'`aria-label` sur le bouton "modifier" (icône crayon) de la
  carte de profil à l'étape OTP, identique à l'écran d'inscription — même
  note, pas corrigée ici.

### Implémentation

Fichier modifié : `app/login/page.tsx` (5 chaînes de texte modifiées :
1 suppression de répétition + 3 alignements du message d'erreur
générique + 1 harmonisation "Envoi…" / "Vérification…"). Rendu réel non
vérifié dans un navigateur (aucun outil
navigateur disponible dans cet environnement) : à confirmer visuellement
par Bryan. `npx tsc --noEmit` : à confirmer par Bryan (voir note écran 01
sur les interruptions répétées de la commande dans cet environnement).

---

## Écran 04a — Accueil (châssis, hero, sections communes)

### Contexte

`app/page.tsx` est en réalité une coquille unique qui héberge 6 onglets
de la barre de navigation du bas (voir note de découpage ci-dessus).
Cet écran couvre uniquement l'onglet **"accueil"** — et seulement sa
partie "châssis", visible que le citoyen soit connecté ou non : hero
(carrousel visiteur *ou* `StatusHero` si connecté), barre de recherche,
grille "Services", carte des prestataires, "Établissements près de
vous", bannière de valeur (visiteur), footer.

Les cartouches personnalisées supplémentaires visibles uniquement une
fois connecté, plus bas sur le même onglet (Parcours Yelen, État
d'attention, Guidance découverte, Actions rapides, Rappels démarches,
Votre argent, Cette semaine, Suggestions intelligentes) sont traitées à
part dans l'écran 04b — ce sont des composants entiers avec chacun leur
propre logique de contenu, pas de simples libellés.

### Inventaire, évaluation et décisions

| Élément | Texte actuel | Décision | Nouveau texte | Justification | Statut |
|---|---|---|---|---|---|
| Salutation (StatusHero, connecté) | "Bonne nuit" / "Bonjour" / "Bon après-midi" / "Bonsoir" | Conserver | — | Standard, adapté à l'heure réelle | ✅ |
| StatusHero — Titre (statut vert) | "Tout est éclairé aujourd'hui." | Conserver | — | Jeu de mots direct avec "Yelen = lumière", exactement le niveau de signature de marque recherché par ce chantier | ✅ |
| StatusHero — Titre (statut rouge) | "Une action importante est en attente." | Conserver | — | Neutre, factuel, jamais alarmiste | ✅ |
| StatusHero — Badge RDV (4 variantes) | "Rendez-vous manqué à traiter" / "RDV {date}" / "Votre prochaine réservation vous attend" / "Faites votre première réservation" | Conserver | — | Adapté à l'historique réel du citoyen (jamais le même message pour un compte neuf vs actif) — déjà l'esprit exact de ce chantier | ✅ |
| StatusHero — Badge démarche | "{n} démarches en retard" / "Une démarche en retard" | Conserver | — | Singulier/pluriel correctement gérés | ✅ |
| StatusHero — Badge document | "{n} documents demandés" / "Un document demandé" | Conserver | — | Idem | ✅ |
| Carrousel visiteur — Slide 1 titre | "Votre RDV en un clic" | Conserver | — | Fait écho à "Votre rendez-vous, en un clic" (metadata `layout.tsx`) | ✅ |
| Carrousel visiteur — Slide 1 sous-titre | "Ne vous déplacez plus au hasard : planifiez, réservez, et gagnez du temps depuis votre mobile." | **Modifier** | "Ne vous déplacez plus pour rien : planifiez, réservez et gagnez du temps depuis votre mobile." | "Au hasard" décrit mal l'idée (se déplacer sans RDV n'est pas "aléatoire", c'est un déplacement inutile) — "pour rien" est plus naturel et plus proche de ce que vit vraiment un citoyen sans RDV | ✅ |
| Carrousel visiteur — Slide 2 titre/sous-titre | "Guinée numérique" / "Les services publics et privés à portée de votre téléphone. Hôpitaux, mairies, banques." | Conserver | — | "Guinée numérique" repris tel quel dans la bannière de valeur plus bas sur le même écran — cohérence interne | ✅ |
| Carrousel visiteur — Slide 3 titre | "Réservez en 30 sec" | 🔎 Signalé, non bloquant | — | Chiffre précis non mesuré nulle part dans le projet — différent du cas "+10 000 utilisateurs" (qui affirmait un volume d'adoption, confirmé faux) : ici c'est une promesse de rapidité générique, langage marketing courant ("en un clic", "instantané"), pas une statistique vérifiable en soi. Signalé par prudence, pas modifié | 🔎 |
| Carrousel visiteur — Slide 3 sous-titre | "Fini les queues interminables — prenez rendez-vous depuis chez vous en toute sécurité." | **Modifier** | "Fini les files d'attente interminables — prenez rendez-vous depuis chez vous en toute sécurité." | "Queues" vs "files d'attente" : la bannière de valeur plus bas sur ce même écran dit déjà "Fini les files d'attente" pour désigner exactement la même idée — deux mots différents pour la même notion sur un seul et même écran, corrigé pour aligner sur la formulation déjà en place | ✅ |
| Carrousel visiteur — Slide 4 titre | "Diaspora Guinea" | **Modifier** | "Diaspora guinéenne" | "Guinea" en anglais au milieu d'une interface entièrement en français — tout indique un oubli plutôt qu'un choix (aucun autre texte de l'app n'est en anglais) | ✅ |
| Carrousel visiteur — Slide 4 sous-titre | "La diaspora guinéenne peut aussi accéder à tous les services depuis l'étranger." | Conserver | — | Clair | ✅ |
| CTA visiteur (sous le carrousel) | "S'inscrire" / "Connexion" | Conserver | — | Identique aux liens des écrans d'auth | ✅ |
| Fallback chargement | "Chargement..." | Conserver | — | Standard | ✅ |
| Placeholders barre de recherche (5) | "Rechercher une institution" / "Trouver un professionnel" / "Planifier un rendez-vous" / "Hôpitaux, mairies, banques..." / "Trouver une ambassade" | **Modifier** (1 sur 5) | "Trouver un hôpital, une mairie, une banque" (remplace "Hôpitaux, mairies, banques...") | 4 des 5 placeholders suivent un rythme "Verbe + nom" (Rechercher/Trouver/Planifier), le 5e rompait ce rythme avec une simple liste de noms suivie de points de suspension — aligné sur le même patron que ses 4 voisins, qui tournent au même endroit toutes les quelques secondes | ✅ |
| Titre section + lien | "Services" / "Tout voir" | Conserver | — | Clair | ✅ |
| Catégories (grille 6) | "Santé" / "Éducation" / "Admin." / "Banque" / "Ambassades" / "Justice" | **Modifier** (1 sur 6) | "Administratif" (remplace "Admin.") | Seule abréviation parmi 6 libellés de catégorie affichés simultanément dans la même grille — les 5 autres sont des mots entiers ; la grille supporte déjà le retour à la ligne (pas de `nowrap`), aucun risque de débordement | ✅ |
| Bannière valeur (visiteur) — Titre | "Yelen224 — Votre temps est précieux" | Conserver | — | Clair | ✅ |
| Bannière valeur — Sous-titre | "La plateforme officielle de la Guinée numérique" | Conserver | — | Reprend "Guinée numérique" du carrousel juste au-dessus — cohérence interne | ✅ |
| Bannière valeur — Point 1 | "⚡ Gagnez du temps" / "Fini les files d'attente. Vos démarches depuis votre mobile." | Conserver | — | Référence de vocabulaire pour l'alignement du carrousel ci-dessus | ✅ |
| Bannière valeur — Point 2 | "🔗 Tout centralisé" / "Un seul compte pour accéder à des centaines de services." | 🔎 Signalé, non bloquant | — | "Des centaines de services" est une estimation de catalogue (institutions × services listés), pas une affirmation d'adoption comme "+10 000 utilisateurs" (confirmé faux) — catégorie de risque différente, vérifiable par Bryan en base si besoin. Signalé par prudence, pas modifié | 🔎 |
| Bannière valeur — Point 3 | "🔐 100% Sécurisé" / "Vos données sont protégées. Chiffrement AES-256 bancaire." | Conserver | — | Déjà réutilisé 2 fois côté onboarding — source de vérité confirmée | ✅ |
| Bannière valeur — CTA | "Créer mon compte" / "Se connecter" | Conserver | — | Identique aux autres écrans d'auth | ✅ |
| Carte — Titre + actions | "Carte des prestataires" / "Agrandir" / "Plein écran" | Conserver | — | Deux boutons différents pour la même action (ouvrir la carte), mais à deux endroits différents de l'écran (en-tête de section vs flottant sur la carte elle-même) — redondance d'accès délibérée, pas une répétition de texte à corriger | ✅ |
| Établissements — Titre + lien | "Établissements près de vous" / "Voir tout" | Conserver | — | Clair | ✅ |
| État vide — Ville manquante | "Ajoutez votre ville" / "Renseignez votre ville pour découvrir les établissements disponibles près de chez vous." / "Choisir ma ville" | Conserver | — | Trois formulations proches ("Ajoutez"/"Renseignez"/"Choisir") mais non identiques — évite la répétition littérale du même mot 3 fois de suite tout en restant sur un seul message | ✅ |
| État vide — Aucun établissement dans la ville | "Pas encore d'établissement à {ville}" / "Yelen224 arrive progressivement dans toutes les préfectures. Aidez-nous à le faire connaître autour de vous." / "Partager Yelen224" | Conserver | — | Honnête sur l'incomplétude du réseau ("arrive progressivement"), transforme une déception en participation plutôt que de la masquer | ✅ |
| "Pourquoi Yelen ?" — Titre section | "Pourquoi Yelen ?" | Conserver | — | Clair, référence directe à "Why Booking.com?" citée dans le code | ✅ |
| "Pourquoi Yelen ?" — Carte 1 | "Zéro file d'attente" / "Réservez votre créneau à l'avance et présentez-vous directement à l'heure prévue." | **Modifier** (titre seul) | "Fini les files d'attente" | 3e formulation différente de la même promesse sur ce seul écran ("Fini les files d'attente" en bannière, "Fini les files d'attente interminables" au carrousel après correction ci-dessus, "Zéro file d'attente" ici) — alignée sur les deux autres | ✅ |
| "Pourquoi Yelen ?" — Carte 2 | "Rappels automatiques" / "Des notifications avant votre rendez-vous — vous ne l'oublierez pas." | Conserver | — | Clair, personnalisé | ✅ |
| "Pourquoi Yelen ?" — Carte 3 | "Établissements vérifiés" / "Chaque badge \"vérifié\" est accordé après contrôle réel des documents." | Conserver | — | Concret, pas vague ("contrôle réel des documents") | ✅ |
| "Pourquoi Yelen ?" — Carte 4 | "100% gratuit pour vous" / "Créer un compte et réserver un rendez-vous ne coûte jamais rien sur Yelen." | Conserver | — | Cohérent avec le modèle économique réel (RDV gratuit, paiement réservé à des services spécifiques via `paid_bookings`) | ✅ |
| "Pourquoi Yelen ?" — Carte 5 | "Tout centralisé" / "Rendez-vous, documents et QR codes accessibles à tout moment dans un seul espace." | Conserver | — | Titre identique au point 2 de la bannière de valeur ("🔗 Tout centralisé") — réutilisation volontaire déjà cohérente | ✅ |
| À propos — Eyebrow | "Toujours à vos côtés" | Conserver | — | Chaleureux | ✅ |
| À propos — Titre | "YELEN224 — La lumière numérique" | Conserver | — | Écho direct à "Yelen = lumière", cohérent avec "Tout est éclairé aujourd'hui" (StatusHero) | ✅ |
| À propos — Légende vidéo | "YELEN224 connecte chaque citoyen guinéen aux services publics et privés — hôpitaux, mairies, banques, ambassades — en Guinée et dans la diaspora." | Conserver | — | Cohérent avec le cadrage public+privé établi depuis l'onboarding | ✅ |
| Footer | "YELEN224 · République de Guinée" / "SEMPYA224" / "CGU" / "Confidentialité" / "Contact" | Conserver | — | Cohérent avec les 3 écrans précédents | ✅ |

### Comparaison au standard international (Étape 6)

- **Vocabulaire unifié sur tout un même écran** ("files d'attente" au
  lieu de "queues" à un endroit, "Administratif" au lieu de "Admin." à
  un autre) — un citoyen qui voit le carrousel puis fait défiler jusqu'à
  la bannière de valeur, quelques secondes plus tard, ne doit jamais
  sentir qu'il lit deux voix différentes.
- **Correction d'un résidu anglais** ("Diaspora Guinea") dans une
  interface 100 % française — erreur de cohérence linguistique la plus
  nette trouvée depuis le début du chantier.
- **Discipline maintenue sur les chiffres non vérifiés** : "30 sec" et
  "des centaines de services" traités différemment de "+10 000
  utilisateurs" (confirmé faux par Bryan) — signalés par prudence sans
  être traités comme automatiquement fautifs, la distinction entre
  promesse marketing générique et fausse statistique d'adoption est
  maintenue tout au long du chantier.

### Points nécessitant une validation

Deux points **non bloquants**, par prudence uniquement (voir tableau) :
1. "Réservez en 30 sec" (carrousel visiteur, slide 3).
2. "des centaines de services" (bannière de valeur, point 2).

Aucun des deux ne bloque la clôture de cet écran.

### Observations hors périmètre

- **Emojis dans les badges du carrousel visiteur** ("🇬🇳 Officiel", "🏛️
  État", "⚡ Rapide", "🌍 54 pays") : le commentaire de code juste
  au-dessus de `HeroTitre` (ligne ~1967) cite explicitement une demande
  du CEO du 23/07/2026 — *"retire les emojis, crée des vraies SVG"* —
  appliquée à l'icône jour/nuit adjacente mais jamais à ces 4 badges.
  Remplacer un emoji par une vraie icône SVG est un changement de
  composant, pas un changement de texte — hors périmètre de ce chantier,
  mais signalé avec la citation exacte pour qu'un futur chantier
  icônes/design system n'ait pas à la rechercher.

### Implémentation

Fichier modifié : `app/page.tsx` (6 chaînes de texte modifiées :
2 sous-titres du carrousel visiteur, 1 titre du carrousel visiteur,
1 placeholder de recherche, 1 libellé de catégorie, 1 titre de carte
"Pourquoi Yelen ?"). Rendu réel non
vérifié dans un navigateur (aucun outil navigateur disponible dans cet
environnement) : à confirmer visuellement par Bryan. `npx tsc --noEmit` :
à confirmer par Bryan (voir note écran 01).

**Correctif du 08/09/2026** : `PourquoiYelen`/`AboutYelen` (rendus juste
avant le footer, visibles connecté ou non) avaient été omis du premier
passage sur cet écran — ajoutés au tableau et à l'implémentation avant de
passer à l'écran 04b, pour ne pas laisser un trou dans un écran déjà
marqué ✅ Terminé.

---

## Écran 04b — Accueil (cartouches personnalisées, connecté)

### Contexte

Suite de l'écran 04a : composants affichés uniquement si `userId` est
renseigné, entre la barre de recherche et la grille "Services" — dans
l'ordre réel d'affichage : `ParcoursYelenBandeau` (composant partagé,
`components/ParcoursYelenBandeau.tsx`), `EtatAttentionCard` ("À faire"),
`GuidanceDecouverteCard` ("Pour vous aujourd'hui"), `QuickActions`
("Actions rapides"), `RappelsDemarches` ("Vos démarches en cours"),
`VotreArgent`, `CetteSemaine`.

Plusieurs de ces cartouches affichent du **contenu dynamique produit par
une API** (`lib/attentionEngine.ts`, `lib/discoveryEngine.ts`,
`lib/semaineEngine.ts`) — les phrases elles-mêmes (`geste.interpretation`,
`c.titre`, `c.observation`...) vivent dans ces fichiers `lib/`, pas dans
`app/page.tsx`. Elles ne sont pas inventoriées ligne par ligne ici (ce
serait un autre écran/chantier à part entière, avec sa propre logique de
génération de texte) — seuls les libellés statiques de la coquille
(titres de section, sous-titres, badges, CTA) sont couverts.

### Inventaire, évaluation et décisions

| Élément | Texte actuel | Décision | Nouveau texte | Justification | Statut |
|---|---|---|---|---|---|
| Parcours Yelen — Eyebrow | "Parcours Yelen" | Conserver | — | Clair | ✅ |
| Parcours Yelen — Titre | "Continuez votre parcours Yelen" / "Vous êtes presque arrivé !" | Conserver | — | Motivant, distinct selon la progression réelle | ✅ |
| Parcours Yelen — Sous-texte | "Commencez par compléter votre profil." / "Il vous reste une étape pour compléter votre parcours Yelen." / "Prochaine étape : {étape}." | Conserver | — | Dynamique, jamais de contenu fabriqué | ✅ |
| À faire — Titre + sous-titre | "À faire" / "Ce qui mérite votre attention en ce moment" | Conserver | — | Clair, neutre | ✅ |
| À faire — Contenu | `geste.interpretation` / `geste.action_proposee.label` | Non couvert | — | Contenu généré par `lib/attentionEngine.ts` — hors périmètre de cette fiche écran, à traiter comme son propre chantier de contenu si besoin | — |
| Pour vous aujourd'hui — Titre | "Pour vous aujourd'hui" | Conserver | — | Bien distinct de "Pour vous" (autre carte, plus bas) malgré la proximité visuelle — le qualificatif "aujourd'hui" évite la confusion | ✅ |
| Pour vous aujourd'hui — Sous-titre | "Des suggestions personnalisées selon votre activité" | 🔎 Signalé, non bloquant | — | Très proche de "Basé sur vos centres d'intérêt et votre activité récente" (carte "Pour vous" du même écran) — deux moteurs de personnalisation différents mais un vocabulaire de sous-titre presque interchangeable. Pas assez net pour trancher seul lequel reformuler sans risquer de perdre la nuance entre les deux mécanismes | 🔎 |
| Pour vous aujourd'hui — Lien "Voir tout" | "Voir tout →" | 🔎 **Signalé, prioritaire** | — | Ce n'est pas un lien : c'est un `<span>` décoratif, sans destination — le commentaire de code juste au-dessus le confirme explicitement ("aucune page 'voir tout' n'existe encore"). Or "Vos démarches en cours", plus bas sur ce même écran, affiche un vrai lien "Voir tout" fonctionnel avec le même style visuel exact — un citoyen qui a testé l'un s'attend à ce que l'autre fonctionne aussi. Je n'ai pas de solution purement textuelle : soit construire la page de destination (hors périmètre, fonctionnel), soit retirer l'élément (hors périmètre, composant) — signalé pour décision produit | 🔎 |
| Pour vous aujourd'hui — Contenu carrousel | `c.titre` / `c.interpretation` / `c.action.label` | Non couvert | — | Généré par `lib/discoveryEngine.ts` — même remarque que "À faire" | — |
| Actions rapides — Titre + tag | "Actions rapides" / "Vos raccourcis" | Conserver | — | Clair | ✅ |
| Actions rapides — Carte 1 | "Prendre un RDV" / "Trouver une institution" + badge "POPULAIRE" | Conserver | — | "Populaire" est ici l'action centrale de toute l'app (prendre un RDV) — affirmation raisonnablement vraie par construction, pas une statistique à vérifier comme "+10 000 utilisateurs" | ✅ |
| Actions rapides — Carte 2 | "Mon QR Code" / "Confirmer ma présence" | **Modifier** (titre seul) | "Mon QR code" | Casse française incorrecte : "Code" ne prend pas de majuscule au milieu d'un groupe nominal (contrairement à "QR", acronyme). Comparé aux 2 autres cartes de la même grille ("Mes démarches" respecte déjà la casse correcte) | ✅ |
| Actions rapides — Carte 3 | "Payer une Facture" / "Eau · Électricité · Mobile" + badge "BIENTÔT" | **Modifier** (titre seul) | "Payer une facture" | Même erreur de casse que "Mon QR Code" ; badge "BIENTÔT" lui-même déjà honnête (n'affirme pas que la fonctionnalité existe) | ✅ |
| Actions rapides — Carte 4 | "Mes démarches" / "{n} en cours" / "Créer un suivi" | Conserver | — | Casse correcte, dynamique | ✅ |
| Pour vous — Titre + tag | "Pour vous" / "Personnalisé" | Conserver | — | Clair | ✅ |
| Pour vous — Sous-titre | "Basé sur vos centres d'intérêt et votre activité récente" | Conserver | — | Voir remarque sur "Pour vous aujourd'hui" ci-dessus | ✅ |
| Pour vous — Carte offre (CTA repli) | "Découvrir l'offre" | Conserver | — | Clair | ✅ |
| Pour vous — Carte proximité | "À proximité de vous · Disponible maintenant" + tag "Près de vous" | 🔎 **Signalé, non bloquant** | — | "Disponible maintenant" est affiché dès qu'un établissement a des coordonnées GPS enregistrées, sans vérification réelle des horaires d'ouverture au moment de l'affichage — même catégorie de problème que `CarteMapHome.tsx::getStatus()`, déjà documenté comme non fiable dans CLAUDE.md (`/backlog-produit`). Je n'ai pas retiré la mention seul : elle est peut-être voulue en l'état (établissement disponible à la réservation, pas nécessairement ouvert à l'instant T) — à trancher avec Bryan | 🔎 |
| Pour vous — Carte habitude | "{établissement}" / "Là où vous allez le plus souvent" + tag "Vos habitudes" | Conserver | — | Dérivé du vrai historique (seuil ≥3 RDV), jamais un texte générique sans preuve — déjà l'esprit du chantier | ✅ |
| Vos démarches en cours — Titre + lien | "Vos démarches en cours" / "Voir tout" | Conserver | — | Lien réellement fonctionnel (`/compte/mes-demarches`), sert de référence pour signaler le faux "Voir tout" de "Pour vous aujourd'hui" ci-dessus | ✅ |
| Vos démarches en cours — Statuts | "En retard" / "Bientôt" / "En cours" | Conserver | — | 3 états courts et clairs | ✅ |
| Vos démarches en cours — Compteur étapes | "{n}/{n} étapes" | Conserver | — | Factuel | ✅ |
| Votre argent — Titre + sous-titre | "Votre argent" / "Vos récompenses et vos dépenses en un coup d'œil" | Conserver | — | Clair | ✅ |
| Votre argent — Ligne Rewards | "{n} points Yelen Rewards" / "{n} points avant « {palier} »" / "Tous les paliers débloqués" | Conserver | — | Dynamique, clair | ✅ |
| Votre argent — Ligne dépense | "{catégorie}, votre plus grosse dépense du mois" | Conserver | — | Clair | ✅ |
| Cette semaine — Titre + période + sous-titre | "Cette semaine" / "{période}" / "Ce qui a marqué votre activité récente sur Yelen" | Conserver | — | Clair | ✅ |
| Cette semaine — Tags catégorie | "DÉPENSES" / "DÉMARCHE" / "RENDEZ-VOUS" / "REWARDS" / "AVIS" | Conserver | — | Cohérent avec le style majuscule déjà utilisé par les autres badges de l'écran (POPULAIRE, BIENTÔT) | ✅ |
| Cette semaine — Contenu carrousel | `c.titre` / `c.observation` / `c.action.label` | Non couvert | — | Généré par `lib/semaineEngine.ts` — même remarque que "À faire" | — |

### Comparaison au standard international (Étape 6)

- **Casse française corrigée sur 2 des 4 libellés "Actions rapides"** —
  erreur simple mais très visible, la grille affiche les 4 côte à côte
  en permanence pour tout citoyen connecté.
- **Détection d'une fausse affordance** ("Voir tout →" non cliquable,
  visuellement identique à un vrai lien 4 cartouches plus bas sur le même
  écran) — c'est exactement le genre d'incohérence qu'un audit éditorial
  sérieux doit remonter même s'il ne peut pas la corriger lui-même :
  Stripe/Shopify traitent ce type de "lien mort visuel" comme un bug
  produit, pas une question de style.
- **Cohérence des badges de statut maintenue** (POPULAIRE / BIENTÔT /
  DÉPENSES / DÉMARCHE / RENDEZ-VOUS / REWARDS / AVIS) : tous en
  majuscules, gras, courts — un seul langage visuel de badge sur tout
  l'écran, jamais réinventé cartouche par cartouche.

### Points nécessitant une validation

Trois points, **aucun bloquant** pour la clôture de cet écran (aucun ne
touche à une phrase de texte pur, tous nécessitent soit une décision
produit soit une correction hors du périmètre texte) :
1. **"Voir tout →" non fonctionnel** (Pour vous aujourd'hui) — priorité
   la plus haute des trois, contraste direct avec un vrai lien du même
   nom sur le même écran.
2. **"Disponible maintenant"** (carte proximité) — à rapprocher du
   problème déjà documenté sur `CarteMapHome.tsx::getStatus()`.
3. Sous-titres "Pour vous" / "Pour vous aujourd'hui" quasi redondants —
   le plus mineur des trois, purement stylistique.

### Observations hors périmètre

- Les phrases générées par `lib/attentionEngine.ts`,
  `lib/discoveryEngine.ts` et `lib/semaineEngine.ts` (contenu des cartes
  "À faire", "Pour vous aujourd'hui" et "Cette semaine") n'ont pas été
  relues dans cette fiche — ce sont des moteurs de génération de texte à
  part entière, pas de simples libellés statiques d'écran. À traiter
  comme un chantier éditorial dédié si Bryan le souhaite.

### Implémentation

Fichier modifié : `app/page.tsx` (2 chaînes de texte modifiées : casse de
2 libellés "Actions rapides"). Rendu réel non vérifié dans un navigateur
(aucun outil navigateur disponible dans cet environnement) : à confirmer
visuellement par Bryan. `npx tsc --noEmit` : à confirmer par Bryan (voir
note écran 01).

---

## Écran 05 — Onglet Recherche (Grille / Liste / Carte)

### Contexte

`app/recherche/RechercheInner.tsx` (1963 lignes) — écran le plus dense
analysé jusqu'ici. Trois vues sur les mêmes résultats (Grille façon
Amazon, Liste horizontale façon comparateur, Carte plein écran façon
DoorDash), un carrousel Hero contextuel par vue, des rails de découverte
("Populaire", "Recommandé pour vous", "Vos favoris"...), un panneau de
filtres avancés, et 3 états de fin de parcours (aucun résultat, fin de
liste, carte sans établissement géolocalisé). La barre de recherche
elle-même n'est plus qu'un déclencheur : le clic ouvre
`RechercheOverlay.tsx` (fichier séparé, non couvert ici — voir écran 05b
dans le suivi global).

### Verdict général

**Contrairement aux écrans précédents, cette passe n'a abouti à aucune
modification.** Après lecture intégrale, le texte de cet écran est déjà
au niveau visé par ce chantier — voir "Comparaison au standard
international" ci-dessous pour le détail. Conformément à la règle du
brief ("ne pas réécrire pour réécrire"), je documente l'inventaire
complet et les décisions de conservation plutôt que d'inventer des
changements pour justifier la passe.

### Inventaire, évaluation et décisions (groupé par zone d'écran)

| Élément | Texte actuel | Décision | Justification | Statut |
|---|---|---|---|---|
| Recherche (3 vues) — Placeholder | "Institution, service, ville…" | Conserver | Identique dans les 3 vues (Grille/Liste/Carte) — un seul vocabulaire de recherche, jamais réinventé par onglet | ✅ |
| Toggle de vue (aria-labels) | "Grille" / "Liste" / "Carte" | Conserver | Clair | ✅ |
| Coach mark (1re visite) | "Grille, Liste ou Carte" / "Ces 3 icônes changent l'affichage des résultats — touchez pour essayer." | Conserver | Pédagogique, se ferme tout seul, ton direct | ✅ |
| Chips catégories | "Tout" + libellés courts (`ACTIVITE_CATEGORIE_SHORT`) | Conserver | Version courte cohérente avec l'espace disponible (chip étroite) ; la version longue existe ailleurs dans le filtre "Ville"/"Trier par" (`<select>`, plus d'espace) — deux registres justifiés par le contexte, pas une incohérence | ✅ |
| Hero — Bandeaux onglet Grille | "Bonjour, {prénom}" / "Votre espace Yelen" / "Découvrir les Offres" / "Yelen Rewards" + textes associés | Conserver | Aucun chiffre inventé (le carrousel v1 avait des métriques internes, retirées — voir commentaire `SignatureYelen`), 3 destinations réelles du produit | ✅ |
| Hero — Bandeaux onglet Liste | "Établissements vérifiés" / "{n} rendez-vous en cours" | Conserver | Le bandeau RDV ne s'affiche que si le citoyen a de vrais RDV actifs — jamais un bandeau vide | ✅ |
| Hero — Fermeture (aria-label) | "Fermer ce bandeau pour 7 jours" | Conserver | Dit précisément ce que fait le bouton (durée réelle), plus utile qu'un simple "Fermer" | ✅ |
| Filtres avancés — Titre + labels | "Filtres avancés" / "Ville" / "Trier par" / "Type" | Conserver | Clair | ✅ |
| Filtres — Options de tri | "Pertinence" / "Meilleure note" / "Plus d'avis" / "Alphabétique" | Conserver | Cohérent avec les versions courtes "Note"/"Avis"/"A-Z" utilisées dans le sélecteur compact des résultats — même registre long/court justifié qu'au-dessus | ✅ |
| Filtres — Type (chips) | "Tous" / "Institutions" / "Entreprises" / "Professionnels" | Conserver | Clair | ✅ |
| Filtres — Cases à cocher | "Institutions vérifiées uniquement" / "Avec créneaux disponibles" | Conserver | Clair, factuel | ✅ |
| Filtres — Réinitialiser | "Réinitialiser ({n} filtre{s})" | Conserver | Pluriel géré correctement | ✅ |
| Rails de découverte — Titres | "Populaire" / "Recommandé pour vous" / "Vos favoris" / "Nouveau sur Yelen" / "Près de chez vous" / "Partenaires vérifiés" / "Les mieux notées" | Conserver | **"Les mieux notées" plutôt que "Populaire"/"Tendance"** est un choix explicitement documenté dans le code : aucun compteur de vues de profil n'existe dans le produit, un vrai rail "populaire" générique aurait été un signal fabriqué — seul le rail "Populaire" ci-dessus (classement réel vues+avis+réservations, `app/api/citoyen/institutions/populaires`) a droit à ce mot. Exactement la discipline recherchée par ce chantier, déjà appliquée avant même son lancement | ✅ |
| Rail "Recommandé pour vous" — sous-titre | "Basé sur vos rendez-vous en {secteur}" | Conserver | Dynamique, jamais générique | ✅ |
| Rail "Partenaires vérifiés" — sous-titre | "Identité et activité confirmées par Yelen" | Conserver | Clair | ✅ |
| Cartes résultat — Disponibilité | "Créneaux disponibles" / "Sur demande" | Conserver | Reflète une vraie donnée (`disponibilites`), jamais un statut inventé | ✅ |
| Cartes résultat — CTA repli | "Voir la fiche" | Conserver | Identique en Grille et en Liste | ✅ |
| Sheet "Voir plus" | "Écrit par {institution}" / "Services proposés" / "Poser une question" | Conserver | Attribution honnête du texte, CTA réel (réutilise le mécanisme existant, pas une messagerie fabriquée) | ✅ |
| En-tête résultats (Grille + Liste) | "Comparez {n} établissement{s}{à ville}" | Conserver | Identique dans les 2 vues, pluriel correct | ✅ |
| Tri compact (Grille + Liste) | "Pertinence" / "Note" / "Avis" / "A-Z" | Conserver | Identique dans les 2 vues | ✅ |
| Pagination | "Charger la suite ({n} restants)" | Conserver | Identique en Grille et en Liste | ✅ |
| Vue Carte — Établissement introuvable | "Aucun établissement localisé pour l'instant" / "Les établissements apparaîtront ici dès qu'ils auront renseigné leur position depuis leur espace Yelen224." | Conserver | Honnête sur une limite connue du produit (aucune institution n'a encore de coordonnées GPS, voir CLAUDE.md `/backlog-produit`) — traite le problème par un texte assumé plutôt que par un faux statut, exactement le contraste positif au problème signalé en écran 04b ("Disponible maintenant") | ✅ |
| Vue Carte — Recherche de zone | "Rechercher dans cette zone" / "Toutes les zones" | Conserver | Clair | ✅ |
| Aucun résultat — Titre | "C'est tout pour cette recherche" | Conserver | Choix assumé documenté dans le code pour éviter un "Aucun résultat" sec — le sous-titre juste en dessous lève toute ambiguïté sur le fait qu'il s'agit bien de zéro résultat, pas d'une fin de liste (voir remarque de vigilance ci-dessous) | ✅ |
| Aucun résultat — Sous-titre | "Nous n'avons trouvé aucun établissement correspondant à vos critères actuels." / "Aucun établissement n'est encore référencé ici." | Conserver | Contextualisé selon qu'une recherche est active ou non — jamais le même message générique | ✅ |
| Aucun résultat — Actions | "Modifier les filtres" / "Explorer les catégories" | Conserver | Clair, jamais une impasse | ✅ |
| Fin de liste — Titre | "Vous avez atteint la fin" | Conserver | Distinct de "C'est tout pour cette recherche" (zéro résultat) — les deux ne se confondent qu'en apparence, voir remarque ci-dessous | ✅ |
| Fin de liste — Sous-titre + actions | "Vous avez consulté tous les établissements correspondant à votre recherche." / "Continuer à explorer" / "Élargir ma recherche" | Conserver | Clair, jamais une impasse | ✅ |
| Signature de fin (`SignatureYelen`) | "Yelen — Le répertoire professionnel de confiance." / "Des établissements et services référencés pour vous aider à trouver ce dont vous avez besoin." | Conserver | "Répertoire" reprend l'eyebrow "ANNUAIRE" déjà affiché sous le logo en Vue Liste sur ce même écran — framing "comparaison/annuaire" volontairement différent du framing "prise de RDV" des autres écrans, cohérent pour un contexte de recherche/comparaison, pas une dérive de positionnement | ✅ |
| Signature de fin — Liens | "Aide" / "Contact" / "Confidentialité" / "Conditions" | Conserver | Tous des liens réels ; "Contact" utilisé à la place d'un inexistant "/a-propos", documenté explicitement dans le code | ✅ |

### Comparaison au standard international (Étape 6)

- **Discipline "zéro donnée inventée" déjà internalisée avant même ce
  chantier** : rail "Les mieux notées" plutôt que "Populaire" générique,
  état vide honnête sur la carte plutôt qu'un faux statut, carrousel Hero
  sans métriques internes fabriquées (v1 les avait, retirées) — c'est
  précisément le standard Stripe/Shopify/Google (jamais un chiffre qui ne
  peut pas être défendu si on le demande) déjà en place.
- **Réutilisation systématique des mêmes libellés entre vues** ("Comparez
  N établissements", "Charger la suite", tri compact, placeholder de
  recherche) plutôt qu'une réinvention par onglet — trois vues qui
  sonnent comme un seul écran, pas trois écrans recollés.
- **Deux registres de longueur de texte (court en chip, long en select)
  assumés et cohérents**, pas une incohérence de vocabulaire — distinction
  vérifiée avant d'être validée comme acceptable, pas supposée.

### Points de vigilance (non modifiés, à garder en tête)

- **"C'est tout pour cette recherche" (0 résultat) vs "Vous avez atteint
  la fin" (fin d'une vraie liste)** : les deux titres pourraient se
  confondre pris isolément, mais chacun est immédiatement suivi d'un
  sous-titre qui lève l'ambiguïté. Choix assumé et documenté dans le
  code (éviter un "Aucun résultat" sec) — je ne l'ai pas modifié, mais je
  le note explicitement au cas où un futur audit UX (pas éditorial) le
  remettrait en question.

### Observations hors périmètre

Aucune.

### Implémentation

**Correctif du 08/09/2026, ajouté en traitant l'écran 05b** : le rail
"Partenaires vérifiés" (`<Rail titre="Partenaires vérifiés" .../>`, ligne
~1606) a été renommé **"Établissements vérifiés"** pour correspondre au
Hero slide de ce même fichier (onglet 2, kicker "Confiance Yelen") et au
rail équivalent de `RechercheOverlay.tsx` — les trois désignaient déjà
exactement le même signal (`badge_verifie`) avec la même phrase de
sous-titre ("Identité et activité confirmées par Yelen"), seul ce rail
utilisait un nom différent. Détail complet dans la fiche écran 05b
ci-dessous. En dehors de ce correctif ponctuel, aucune autre modification
de code sur cet écran — inventaire et validation uniquement (voir
"Verdict général" ci-dessus).

---

## Écran 05b — Search Overlay

### Contexte

`app/recherche/RechercheOverlay.tsx` (775 lignes) — l'écran plein écran
réellement ouvert au clic sur n'importe quelle barre de recherche de
l'app (Accueil, onglet Recherche, quel que soit la vue). Trois états :
saisie active (résultats groupés par type : Établissements/Services/
Catégories/Localisation/Offres/Recommandations), état "idle" avant toute
saisie (recherches récentes/populaires, établissements récemment
consultés, rails de découverte, catégories), et aucun résultat.

### Inventaire, évaluation et décisions

| Élément | Texte actuel | Décision | Nouveau texte | Justification | Statut |
|---|---|---|---|---|---|
| Placeholder recherche | "Institution, service, ville…" | Conserver | — | Identique à `RechercheInner.tsx` — un seul vocabulaire de recherche dans toute l'app | ✅ |
| Bouton micro (désactivé) | aria-label "Recherche vocale — bientôt disponible" / title "Bientôt disponible" | Conserver | — | Honnête : le bouton est visuellement présent mais réellement désactivé, jamais un faux bouton silencieux | ✅ |
| Filtres avancés | "Filtres avancés" / "Ville" / "Trier par" / "Type" / options de tri / chips Type / "Réinitialiser ({n} filtre{s})" | Conserver | — | Identique à `RechercheInner.tsx`, cohérence totale entre les deux panneaux de filtres du même système de recherche | ✅ |
| Filtres — cases supplémentaires | "Ouvert maintenant" / "Mes favoris uniquement" | Conserver | — | Clair (2 filtres en plus du panneau de `RechercheInner.tsx`, différence fonctionnelle assumée, pas un problème de texte) | ✅ |
| Aucun résultat — Titre | "Aucun résultat trouvé" | **Modifier** | "C'est tout pour cette recherche" | `RechercheInner.tsx` évite délibérément cette formule exacte pour son propre état zéro résultat (commentaire du code : "jamais un simple 'Aucun résultat' sec") — cette popup s'ouvre depuis la même barre de recherche que cet écran, pour la même requête : un citoyen qui tape une recherche sans résultat ici, puis valide, ne doit pas lire deux messages différents pour exactement la même situation. Alignée sur la formule déjà choisie et documentée côté `RechercheInner.tsx` | ✅ |
| Aucun résultat — Description | "Nous n'avons trouvé aucun établissement correspondant à « {requête} »." | Conserver | — | Cohérent avec la description équivalente de `RechercheInner.tsx` | ✅ |
| Aucun résultat — Actions | "Explorer les catégories" / "Voir les établissements populaires" | Conserver | — | Jamais une impasse | ✅ |
| Recherches récentes (actif + idle) | "Recherches récentes" / "Tout effacer" | Conserver | — | Même titre dans les 2 états (filtré pendant la saisie, complet à l'état idle) | ✅ |
| Sections de résultats (saisie active) | "Établissements" ("Voir tout") / "Services" / "Catégories" ("Explorer") / "Localisation" / "Offres" / "Recommandations" | Conserver | — | Le libellé "voir tout" varie intentionnellement selon la section (Explorer pour une catégorie, Voir tout pour des établissements) plutôt qu'un mot générique répété partout | ✅ |
| Recommandations — sous-titre | "Basé sur vos rendez-vous en {secteur}" | Conserver | — | Identique au rail équivalent de `RechercheInner.tsx` | ✅ |
| Offre — CTA | "Découvrir →" | Conserver | — | Clair | ✅ |
| Idle — Bandeau d'accueil | "Que recherchez-vous ?" / "Une institution, un service, une entreprise ou un professionnel." | Conserver | — | Décrit fidèlement les 4 types de résultats réellement retournés par la recherche | ✅ |
| Idle — Recherches populaires | "Recherches populaires" | Conserver | — | Section vide tant qu'aucune recherche réelle n'existe (table dédiée, aucun terme fabriqué en repli) — voir en-tête du fichier | ✅ |
| Idle — Récemment consultés | "Récemment consultés" | Conserver | — | Clair | ✅ |
| Idle — Rails de découverte | "Populaires près de vous" (+"À {ville}") / "Nouveau sur Yelen" / "Les mieux notées" / "Établissements vérifiés" (+sous-titre) / "Recommandé pour vous" (+sous-titre) | Conserver | — | 4 des 5 titres sont déjà des reprises exactes des rails de `RechercheInner.tsx` — cohérence déjà bonne ; le 5e ("Établissements vérifiés") a révélé l'incohérence corrigée dans `RechercheInner.tsx` (voir Implémentation, écran 05) | ✅ |
| Idle — Favoris | "Vos favoris" | Conserver | — | Identique au rail de `RechercheInner.tsx` | ✅ |
| Idle — Catégories | "Catégories" | Conserver | — | Clair | ✅ |
| Idle — Invite connexion | "Connectez-vous pour retrouver vos favoris et vos recommandations personnalisées." | Conserver | — | Ton non insistant, cohérent avec le reste du produit (jamais un blocage) | ✅ |

### Comparaison au standard international (Étape 6)

- **Un seul système de recherche, pas deux écrans qui se contredisent** :
  la correction du titre "Aucun résultat trouvé" → "C'est tout pour
  cette recherche" évite qu'un citoyen lise deux messages différents
  pour la même absence de résultat selon qu'il regarde l'overlay en
  tapant ou l'écran résultat une fois validé.
- **Détection d'une dérive de nommage entre 3 emplacements** (Hero slide
  de `RechercheInner.tsx`, rail de découverte du même fichier, rail
  idle de cet overlay) pour un seul et même signal (`badge_verifie`) —
  2 des 3 disaient déjà "Établissements vérifiés", seul le rail de
  découverte disait "Partenaires vérifiés" ; corrigé par consensus
  majoritaire plutôt qu'un choix arbitraire.

### Points nécessitant une validation

Aucun.

### Observations hors périmètre

Aucune.

### Implémentation

Fichiers modifiés : `app/recherche/RechercheOverlay.tsx` (1 chaîne de
texte) + `app/recherche/RechercheInner.tsx` (1 chaîne de texte,
correction de cohérence croisée détaillée ci-dessus dans la fiche écran
05). Rendu réel non vérifié dans un navigateur (aucun outil navigateur
disponible dans cet environnement) : à confirmer visuellement par Bryan.
`npx tsc --noEmit` : à confirmer par Bryan (voir note écran 01).

---

## Écran 06 — Onglet Offres

### Contexte

`app/page.tsx`, onglet "offres" (JSX ~4541-5010, plus composants
partagés `OffreTuile`/`PromoBandeauLarge`/`PROMO_BANDEAUX` définis plus
haut dans le même fichier, ~lignes 158-633). Feed d'offres partenaires
avec porte d'entrée obligatoire (Conditions des Offres), carrousel
"Offres populaires", flux mixte vertical/horizontal avec bandeaux promo
intercalés (Leçons d'argent/Calculatrice/Mes démarches/Recherche), et un
panneau de recherche plein écran dédié aux offres (distinct du système
de recherche d'établissements des écrans 05/05b).

### Inventaire, évaluation et décisions

| Élément | Texte actuel | Décision | Nouveau texte | Justification | Statut |
|---|---|---|---|---|---|
| Porte d'entrée (conditions non acceptées) | "Accès aux Offres bloqué" / "Vous devez accepter les Conditions des Offres Yelen pour consulter cet onglet." / "Accepter les conditions" | Conserver | — | Clair, direct | ✅ |
| En-tête | "Offres Yelen" / "Avantages exclusifs de nos partenaires vérifiés." | Conserver | — | Honnête : uniquement de vrais partenaires | ✅ |
| Chips catégories | "Tout" + libellés dérivés des offres publiées | Conserver | — | Jamais une liste codée en dur (dérivée des offres réelles) | ✅ |
| Bandeau Yelen Rewards | "Yelen Rewards" / "Des récompenses réelles à débloquer" | Conserver | — | "Réelles" fait écho au commentaire du code : aucun solde chiffré affiché ici faute d'être chargé, copie honnête plutôt qu'un chiffre approximatif | ✅ |
| Chargement | "Chargement des offres…" | Conserver | — | Standard | ✅ |
| Vide — filtre actif | "Aucune offre trouvée" / "Essayez un autre mot-clé ou changez de catégorie." / "Voir toutes les offres" | Conserver | — | Jamais une impasse | ✅ |
| Vide — aucune offre publiée | "Aucune offre partenaire pour le moment" / "Nos établissements partenaires n'ont pas encore publié d'offre. Revenez bientôt." | Conserver | — | Honnête, pas de contenu fabriqué pour combler le vide | ✅ |
| Section vedette | "Offres populaires" | Conserver | — | Classement réel (nb_clics + épinglage), jamais inventé — même discipline que le rail "Populaire" de l'écran 05 | ✅ |
| Carte offre — Ruban vedette | "★ EN VEDETTE" | Conserver | — | Réservé à la variante "populaire", cohérent avec le titre de section au-dessus | ✅ |
| Carte offre — CTA | `offre.cta_label` ou repli "Voir l'offre" | Conserver | — | Respecte le libellé propre du partenaire quand il existe | ✅ |
| Carte offre — Lien clarification | "Voir les détails" | Conserver | — | Clarifie explicitement qu'un tap ouvre d'abord la fiche, jamais une redirection immédiate — décision documentée dans le code après un retour terrain | ✅ |
| Carte offre — Expiration | "Expire aujourd'hui" / "Expire demain" / "Expire dans {n} j" | Conserver | — | Uniquement la vraie date d'expiration, jamais un compte à rebours artificiel (précision explicite du code) | ✅ |
| Bloc conditions | "Avant de profiter d'une offre" / "Comprenez comment fonctionnent les offres Yelen, les recommandations Reward et les redirections vers nos partenaires." / "Consulter les conditions" | Conserver | — | Transparent sur le fait que les offres redirigent vers des partenaires externes | ✅ |
| Bandeau promo — Leçons d'argent | "Apprenez les bases en 2 minutes" / "Épargne, mobile money, microcrédit : des leçons courtes et sourcées." / "Apprendre" | Conserver | — | "Sourcées" cohérent avec la discipline factuelle du chantier Leçons d'argent (CLAUDE.md) | ✅ |
| Bandeau promo — Calculatrice | "Simulez avant de vous engager" / "Microcrédit, épargne : estimez vos mensualités et vos intérêts réels." / "Calculer" | Conserver | — | "Intérêts réels" — pas de taux enjolivé | ✅ |
| Bandeau promo — Mes démarches | "Organisez vos démarches" / "Personnelles ou professionnelles, suivez chaque étape jusqu'au bout." / "Organiser" | Conserver | — | Cohérent avec le découpage Personnel/Professionnel déjà établi dans Mes démarches | ✅ |
| Bandeau promo — Recherche | "Trouvez un établissement" / "Hôpitaux, mairies, banques, ambassades : le bon service près de vous." / "Rechercher" | Conserver | — | Reprend la liste d'institutions déjà utilisée mot pour mot à plusieurs endroits de l'app (onboarding, etc.) — cohérence inter-écrans | ✅ |
| Recherche offres — En-tête | "Recherche" | Conserver | — | Minimal, clair | ✅ |
| Recherche offres — Placeholder | "Rechercher une offre, un partenaire…" | Conserver | — | Clair, scope explicite (offres/partenaires, pas les établissements) | ✅ |
| Recherche offres — Aucun résultat | "Aucun résultat" / "Essayez un autre mot-clé ou partenaire." | Conserver | — | Système de recherche autonome, sans lien ni précédent documenté avec la recherche d'établissements (écrans 05/05b) — le choix "sec" n'y pose pas le même problème de cohérence croisée | ✅ |
| Recherche offres — Idle | "Recherchez une offre" / "Par titre, partenaire ou catégorie." / "Recherches récentes" / "Suggestions" | Conserver | — | Clair | ✅ |
| Recherche offres — Récemment consultés | "Consultées récemment" | **Modifier** | "Récemment consultés" | Même motif exact ("récemment consultés/vus") déjà nommé "Récemment consultés" dans `RechercheOverlay.tsx` (écran 05b) — un citoyen qui a déjà vu l'un reconnaît l'autre ; aligné pour cohérence de motif inter-écrans, même si les deux systèmes de recherche restent indépendants | ✅ |

### Comparaison au standard international (Étape 6)

- **Discipline anti-urgence-artificielle** ("Expire dans {n} j" uniquement
  sur vraie date, jamais de compte à rebours fabriqué) et **anti-faux
  classement** ("Offres populaires" basé sur nb_clics réel) — continuité
  directe de la discipline déjà observée sur l'écran 05.
- **Clarification volontaire d'une ambiguïté d'interaction** ("Voir les
  détails" sous le CTA) — exactement le type de correctif qu'un bon UX
  writer ajoute après avoir observé un vrai malentendu utilisateur,
  documenté comme tel dans le code.
- **Alignement de motif entre deux systèmes de recherche indépendants**
  ("Récemment consultés") sans pour autant forcer une fausse cohérence
  là où les deux moteurs sont légitimement différents (ex. "Aucun
  résultat" ici, volontairement pas aligné sur l'écran 05/05b faute de
  lien réel entre les deux parcours).

### Points nécessitant une validation

Aucun.

### Observations hors périmètre

Aucune.

### Implémentation

Fichier modifié : `app/page.tsx` (1 chaîne de texte). Rendu réel non
vérifié dans un navigateur (aucun outil navigateur disponible dans cet
environnement) : à confirmer visuellement par Bryan. `npx tsc --noEmit` :
à confirmer par Bryan (voir note écran 01).

---

## Écran 07 — Onglet RDV (Mes réservations)

### Contexte

`app/page.tsx`, onglet "rdv" (JSX ~5015-5373). Tableau de bord léger des
réservations : stats (Total/À venir/Terminés), mise en avant du RDV en
retard et du prochain RDV, teaser paiement en attente, section "Votre
activité" (dernière réservation/favori/avis/démarche/dépense), et un CTA
vers l'écran complet `/mes-rdv` (gestion réelle : confirmation,
annulation, report, avis — écran 11, pas encore traité).

### Verdict général

**Aucune modification.** Écran déjà exemplaire sur la discipline visée
par ce chantier : jamais un placeholder inventé (chaque carte ne
s'affiche que si sa donnée existe réellement, répété 3 fois dans les
commentaires du code), messages différenciés selon l'historique réel du
citoyen (compte neuf vs actif), ton non alarmiste même sur le cas
"RDV en retard".

### Points forts observés (aucune réécriture nécessaire)

- **Distinction juste "Mes réservations" (ce tableau de bord) vs "Mes
  RDV"** (l'écran complet vers lequel pointe le CTA) : le mot "RDV"
  n'apparaît qu'une fois sur tout l'écran, précisément pour nommer la
  destination réelle du bouton — le reste du texte dit "rendez-vous" en
  toutes lettres. Distinction volontaire nom propre/nom commun, pas une
  incohérence.
- **Pattern "Dernier/Dernière {catégorie}"** cohérent sur les 5 cartes de
  "Votre activité" (réservation/favori/avis/démarche/dépense).
- **État zéro en 2 temps** ("Vous n'avez encore aucun rendez-vous" avec
  timeline pédagogique de 4 étapes, verbes à l'impératif cohérents :
  Choisissez/Sélectionnez/Choisissez/Recevez) puis, une fois un
  historique réel installé mais aucun RDV à venir, un second état plus
  léger ("Aucun rendez-vous à venir") — jamais le même message générique
  pour ces deux situations différentes.
- **"Votre activité commence ici"** (état vide de cette sous-section
  seule) — cadrage tourné vers l'avenir plutôt qu'un constat d'absence.

### Points de vigilance (non modifiés, matérialité jugée trop faible)

- "Près de vous à {ville}" (ce tab, état zéro) / "Établissements près de
  vous" (écran 04a, Accueil) / "Près de chez vous" (écran 05, rail
  Recherche) : 3 formulations pour la même idée de proximité, sur 3
  onglets différents. Les écrans 04a et 05 ont déjà été validés
  indépendamment sans que cette variation soit relevée comme un problème
  à l'époque — l'écran 07 n'est pas raisonnable à isoler après coup pour
  la même chose. Non modifié, signalé pour mémoire seulement.

### Observations hors périmètre

Aucune.

### Implémentation

Aucune modification de code sur cet écran.

---

## Écran 08 — Onglet Communauté

### Contexte

`app/page.tsx` onglet "communaute" (~JSX 5398-5507 + header dédié
~4121-4193) + `components/CommunautePostCard.tsx` (1087 lignes : PostCard,
CommentsSheet, PostDetailOverlay, InteractionsSheet, ImageViewerOverlay,
LegendePostSheet, AbonnementConfirmationSheet) + `CommunauteSuggestions.tsx`
(3 cartes interstitielles). Espace communautaire "pro" façon LinkedIn,
posts citoyens/institutions, likes/commentaires/partages/abonnements.

### Inventaire, évaluation et décisions (résumé — table complète omise
vu le volume, seuls les éléments modifiés ou notables sont détaillés)

| Élément | Texte actuel | Décision | Nouveau texte | Justification | Statut |
|---|---|---|---|---|---|
| Titre écran (x2 : header collapsé + H1 contenu) | "Fil d'actualité & Community" | **Modifier** | "Fil d'actualité et communauté" | Anglicisme + esperluette dans un titre — même défaut que "Diaspora Guinea" (écran 04a) et l'esperluette d'onboarding, ici en plus contredit directement le libellé de l'onglet dans la barre du bas, à un tap de distance : "Communauté" (100 % français) | ✅ |
| Menu Aide — lien Leçons d'argent | "Éducation financière" | **Modifier** | "Leçons d'argent" | 3e nom différent pour la même destination (`/menu/lecons-argent`) — déjà appelée "Leçons d'argent" partout ailleurs (CitoyenMenu, bandeaux promo Offres écran 06) | ✅ |
| Bandeau identité non vérifiée | "Vous pouvez liker, commenter et partager." | **Modifier** | "Vous pouvez aimer, commenter et partager." | Anglicisme ("liker") alors que ce même fichier utilise déjà "J'aime" comme aria-label du bouton like (ImageViewerOverlay) — incohérence interne pure, corrigée en alignant sur le terme français déjà établi | ✅ |
| Confirmation abonnement | "Ses publications apparaîtront dans votre fil Yelen Community." | **Modifier** | "Ses publications apparaîtront dans votre fil Communauté." | Même anglicisme "Community", 3e occurrence trouvée sur cet écran | ✅ |
| Composer / placeholder | "Partager une idée, une expérience…" | Conserver | — | Cohérent avec le sous-titre | ✅ |
| Empty feed | "Aucune publication pour l'instant" / "Soyez parmi les premiers à partager avec la communauté Yelen." | Conserver | — | Invitant | ✅ |
| Empty commentaires | "Aucun commentaire pour l'instant. Soyez le premier à réagir." | Conserver | — | Même cadrage "soyez parmi les premiers" que l'empty feed — cohérence interne déjà bonne | ✅ |
| Menu post (3 emplacements) | "Signaler cette publication" / "Signaler {nom}" | Conserver | — | Identique sur PostCard/PostDetailOverlay/ImageViewerOverlay | ✅ |
| Badge auteur commentaire | "Vous" / "Auteur" | Conserver | — | Distinction claire, jamais confondu avec un commentateur ordinaire | ✅ |
| Saisie commentaire | "Écrire un commentaire…" / "Répondre à {nom}…" | Conserver | — | Identique sur les 2 surfaces qui l'affichent | ✅ |
| Abonnement | "S'abonner" / "Abonné" | Conserver | — | Clair | ✅ |
| "Vérifié par Yelen" | "Vérifié par Yelen" | Conserver | — | Cohérent avec le vocabulaire "vérifié" du reste du produit | ✅ |
| Temps relatif | "À l'instant" / "Il y a {n} min/h/j" / "Le {date}" | Conserver | — | Clair | ✅ |
| Suggestions — 3 cartes | "Établissements à découvrir" / "Vos favoris" / "Établissement du moment" + "Voir l'établissement" | Conserver | — | "Établissement du moment" évite "Populaire"/"Tendance" — même discipline anti-classement-inventé que l'écran 05 | ✅ |
| Suggestions — créneau | "Créneau {quand}" / "Aucun créneau annoncé" | Conserver | — | Honnête, jamais un créneau inventé | ✅ |
| Catégories de post (10) | Ex. "Carrière & Emploi", "Finance & Argent"... | Conserver | — | Esperluette dans des chips compactes — exactement le contexte où la règle établie en écran 01 l'autorise (réservée aux badges/tags, jamais aux titres) | ✅ |

### Comparaison au standard international (Étape 6)

- **3 occurrences du même anglicisme trouvées et corrigées en une passe**
  ("Community" ×2 dans le titre, ×1 dans une confirmation) — la
  cohérence terminologique payante d'avoir déjà tranché la règle
  esperluette/anglicisme dès l'écran 01 : ici, appliquer la même règle
  a suffi à repérer 3 occurrences sans hésitation.
- **Auto-cohérence interne comme preuve** : le fix "liker"→"aimer" ne
  repose pas sur mon jugement seul — le même fichier utilise déjà
  "J'aime" comme aria-label, l'incohérence était donc démontrable par
  le code lui-même, pas une préférence de style.

### Points nécessitant une validation

Aucun.

### Observations hors périmètre

Aucune.

### Implémentation

Fichiers modifiés : `app/page.tsx` (4 chaînes de texte, dont 1 en 2
occurrences identiques) + `components/CommunautePostCard.tsx`
(1 chaîne). Rendu réel non vérifié dans un navigateur (aucun outil
navigateur disponible dans cet environnement) : à confirmer visuellement
par Bryan. `npx tsc --noEmit` : à confirmer par Bryan (voir note écran
01).

---

## Écran 09 — Onglet Compte (menu Mon Compte)

### Contexte

`app/page.tsx`, onglet "compte" (~JSX 5512-5657) + `CarteIdentiteCompte`
(carte "YelenID" en tête, ~ligne 1198) + les tableaux `SECTIONS_COMPTE`
(29 items répartis sur 4 sections : Profil/Mon Activité/Aide et support/
Mentions légales) et `ACTIONS_RAPIDES_COMPTE` (4 raccourcis) qui
alimentent ce menu.

### Inventaire, évaluation et décisions (résumé)

| Élément | Texte actuel | Décision | Nouveau texte | Justification | Statut |
|---|---|---|---|---|---|
| Non connecté | "Non connecté" / "Créez un compte pour accéder à tous les services." / "Créer un compte" / "Se connecter" | Conserver | — | Clair | ✅ |
| Bandeau identité non vérifiée | "Vérifiez votre identité pour sécuriser votre compte et activer le badge « Vérifié »." | Conserver | — | Cohérent avec le vocabulaire "badge Vérifié" du reste du produit | ✅ |
| Carte YelenID — eyebrow | "YELENID" / "PASSEPORT NUMÉRIQUE" | Conserver | — | Métaphore de marque forte, cohérente avec la vision long terme déjà documentée (CLAUDE.md) | ✅ |
| Carte YelenID — statut | "VÉRIFIÉ" / "EN COURS" / "À VÉRIFIER" | Conserver | — | 3 états bien différenciés | ✅ |
| Carte YelenID — stats | "RDV Total" / "Score présence" / "Statut" | 🔎 **Signalé, prioritaire, non modifié** | — | Voir section dédiée ci-dessous — possible contradiction avec une politique produit documentée, pas un simple choix de mot | 🔎 |
| Carte YelenID — CTA | "Modifier mon profil" | Conserver | — | Clair | ✅ |
| Biométrie | "Biométrie active" / "Activer la biométrie" / "Empreinte / Face ID configuré" / "Connexion rapide par empreinte ou Face ID" | Conserver | — | Clair | ✅ |
| Biométrie — badge | "ON" / "OFF" | 🔎 Signalé, non bloquant | — | Anglicisme dans un badge compact — matérialité jugée faible (convention universelle proche d'un pictogramme), non modifié | 🔎 |
| Actions rapides | "Mes rendez-vous" / "Mon QR Code" / "Messagerie" / "Paramètres" | **Modifier** (1/4) | "Mon QR code" | Même faute de casse déjà corrigée à l'identique sur l'écran 04b (Accueil, "Actions rapides") — 2e occurrence de la même incohérence | ✅ |
| Section Profil (6 items) | "Informations personnelles" / "Vérification d'identité" / "Documents personnels" / "Carte Yelen" / "Éducation" / "Langue" | Conserver | — | Clair ; "Éducation" pointe bien vers `/education` (contenu jeunesse/carrière), distinct de "Leçons d'argent" (`/menu/lecons-argent`, corrigé en écran 08) — vérifié, pas une confusion | ✅ |
| Section Mon Activité (11 items) | "Activités passées" / "Mes démarches" / "Mes rendez-vous" / "Messagerie" / "Mes avis" / "Mes établissements favoris" / "Mes paiements" / "Mes remboursements" / "Mes réservations payantes" / "Mes documents" / "Historique des connexions" | Conserver | — | Registre "Mes X" cohérent en première personne (menu de compte), volontairement différent du "Vos X" utilisé dans les rails/bannières (déjà validé écrans précédents) — deux registres légitimes selon le contexte | ✅ |
| Section Aide et support (8 items) | "Centre d'aide" / "FAQ" / "Contacter Yelen" / "Signaler un problème" / "État des services" / "Suggestions" / "Tutoriels" / "Envoyer un feedback" | Conserver | — | "Feedback" vérifié dans le code source (`app/compte/feedback/page.tsx`, commentaire d'en-tête) comme nom d'écran explicitement choisi par Bryan le 24/08/2026 — décision attribuée, pas une dérive à corriger | ✅ |
| Section Mentions légales (6 items) | "Conditions d'utilisation" / "Politique de confidentialité" / "À propos de Yelen" / "Version" / "Gestion des consentements" / "Licences" | Conserver | — | Standard | ✅ |
| Déconnexion | "Déconnexion" | Conserver | — | Clair | ✅ |
| Footer | "© {année} Yelen — Sempya224" / "Version {x}" | Conserver | — | Cohérent | ✅ |

### ⚠️ Point signalé en priorité — "Score présence" (non modifié, hors périmètre texte)

`CarteIdentiteCompte` affiche `Score présence : {pourcentage}%` — un
**score numérique visible**, calculé sur le taux de présence réel aux
RDV du citoyen. Or `CLAUDE.md` documente une décision de fond déjà
actée (`/chantier-strategie-retention-v2`, 21/07/2026) : *"jamais de
score numérique visible attribué à un citoyen"* — précisément pour
éviter tout risque de "crédit social" sur une plateforme adossée à
l'État. Le même document précise que `StatusHero` (Accueil) a déjà été
nettoyé de son propre score chiffré pour cette raison exacte
("Zéro score chiffré... uniquement des badges factuels"). Le commentaire
de code de `CarteIdentiteCompte` indique qu'elle "combine l'ancienne
carte Accueil (stats RDV/score présence) et l'ancienne carte Compte" —
ce score semble donc être un résidu de fusion, jamais retiré alors que
la règle a été appliquée ailleurs.

**Je n'ai pas touché cet élément** : ce n'est pas un choix de mots mais
l'affichage d'une donnée chiffrée dont la présence même contredit une
politique produit documentée — la retirer changerait le comportement de
l'écran (fonctionnel/design), au-delà du périmètre texte de ce chantier.
Signalé comme point prioritaire pour Bryan.

### Comparaison au standard international (Étape 6)

- **Deuxième occurrence de la même faute de casse détectée et corrigée**
  ("Mon QR Code"/"Mon QR code") — la cohérence obtenue à l'écran 04b a
  permis de repérer immédiatement la récidive ici.
- **Vérification avant correction plutôt que présomption** : "feedback"
  ressemblait à un anglicisme à corriger (même famille que "liker"/
  "Community" trouvés à l'écran 08) mais s'est révélé être un choix
  attribué à Bryan dans le code — évité de "corriger" une décision
  produit déjà prise.

### Points nécessitant une validation

Un point **prioritaire** : "Score présence" (voir section dédiée
ci-dessus) — possible contradiction avec une politique produit déjà
actée, à trancher par Bryan (garder tel quel si c'est une exception
volontaire, ou retirer/remplacer par un badge factuel comme sur
`StatusHero`).

### Observations hors périmètre

Aucune (le point "Score présence" est directement un problème du texte/
de la donnée affichée sur cet écran, pas hors périmètre — simplement pas
réparable par un simple changement de mot).

### Implémentation

Fichier modifié : `app/page.tsx` (1 chaîne de texte). Rendu réel non
vérifié dans un navigateur (aucun outil navigateur disponible dans cet
environnement) : à confirmer visuellement par Bryan. `npx tsc --noEmit` :
à confirmer par Bryan (voir note écran 01).

---

## Écran 10 — Coquille partagée Mon Compte

### Contexte

`components/CompteEcranVide.tsx` (header `CompteHeader` + placeholder
`CompteEcranVide`, partagés par les ~19 écrans encore vides sous
`/compte/*`) et `components/CompteRechercheOverlay.tsx` (hub de
recherche interne "Mon Compte", ouvert depuis la loupe du header — 475
lignes, registre de 27 destinations).

### Inventaire, évaluation et décisions

| Élément | Texte actuel | Décision | Nouveau texte | Justification | Statut |
|---|---|---|---|---|---|
| Placeholder écrans vides | "Contenu à venir" | Conserver | — | Honnête, ne prétend rien — couvre à lui seul les ~19 écrans stub du programme Product Hardening | ✅ |
| Header — aria-labels | (retour, recherche, support) | Conserver | — | Icônes seules, cohérent avec la convention Uber/Instagram déjà documentée | ✅ |
| Recherche compte — Registre (27 items) | Reprend quasi mot pour mot `SECTIONS_COMPTE`/`ACTIONS_RAPIDES_COMPTE` (écran 09) | **Modifier** (1/27) | "Mon QR code" (au lieu de "Mon QR Code") | 3e occurrence de la même faute de casse (après Accueil écran 04b et le menu Compte écran 09) — ce registre duplique intentionnellement les libellés de l'onglet Compte, donc hérite du même bug partout où il n'a pas encore été corrigé | ✅ |
| Recherche compte — Titre + fermeture | "Recherche" / "Fermer" | Conserver | — | Clair | ✅ |
| Recherche compte — Placeholder | "Démarches, avis, dépenses, leçons d'argent..." | Conserver | — | Concret, cite de vraies fonctionnalités | ✅ |
| Recherche compte — Zéro résultat | "Aucune action de votre compte ne correspond à « {requête} »." | Conserver | — | Clair | ✅ |
| Recherche compte — Tuile "aller à la recherche" (état actif) | "Chercher un établissement" / "Hôpitaux, mairies, banques, ambassades…" | **Modifier** (titre) | "Rechercher un établissement" | Voir ligne suivante — même action, même écran, 2 libellés différents | ✅ |
| Recherche compte — CTA illustré (état idle) | "Besoin d'un établissement ?" / "Rechercher un prestataire" | **Modifier** (CTA) | "Rechercher un établissement" | Les deux boutons déclenchent exactement la même navigation (`allerVersRecherchePrincipale`) dans le même composant, mais disaient "Chercher un établissement" à un endroit et "Rechercher un prestataire" à l'autre — verbe et nom différents pour une action identique, alignés sur la formulation la plus utilisée dans le reste du produit | ✅ |
| Grille "Dans votre compte" / "Explorer d'autres sujets" | Titres de section | Conserver | — | Clair | ✅ |
| Recherches récentes | "Recherches récentes" / "Tout effacer" | Conserver | — | Cohérent avec les autres recherches de l'app (offres, institutions) | ✅ |

### Comparaison au standard international (Étape 6)

- **3e occurrence de "Mon QR Code" corrigée** — cette coquille dupliquant
  intentionnellement les libellés d'autres écrans, elle hérite
  mécaniquement de leurs bugs non corrigés ; les traiter dans l'ordre a
  permis de les repérer sans effort de recherche supplémentaire.
- **Un seul bouton, deux discours** ("Chercher un établissement" /
  "Rechercher un prestataire") : le genre d'incohérence invisible en
  test isolé (chaque état est vu séparément par l'utilisateur) mais qui
  trahit un composant écrit en plusieurs fois sans relecture d'ensemble
  — exactement ce que ce chantier est censé attraper.

### Points nécessitant une validation

Aucun.

### Observations hors périmètre

Aucune.

### Implémentation

Fichier modifié : `components/CompteRechercheOverlay.tsx` (3 chaînes de
texte). `components/CompteEcranVide.tsx` : aucune modification. Rendu
réel non vérifié dans un navigateur (aucun outil navigateur disponible
dans cet environnement) : à confirmer visuellement par Bryan. `npx tsc
--noEmit` : à confirmer par Bryan (voir note écran 01).

---

## Écran 11 — Mes réservations (`app/mes-rdv/page.tsx`)

### Contexte

1430 lignes. Liste compacte des RDV (filtres par statut, recherche,
prochain RDV mis en avant), pop plein écran "Détail du rendez-vous"
(timeline réelle via `rdv_events`, infos, motifs, avis, reçu, actions),
modales Annuler/Reporter/Avis/Notifications/Aide.

### Inventaire, évaluation et décisions (résumé)

| Élément | Texte actuel | Décision | Nouveau texte | Justification | Statut |
|---|---|---|---|---|---|
| Filtre statut "en_attente" | "En attente" | **Modifier** | "Acceptés" | Contradiction directe avec le badge affiché sur chaque carte de ce même filtre : `STATUT.en_attente.label = "Accepté"`. Un citoyen qui filtre "En attente" voit des cartes marquées "Accepté" — deux mots différents pour le même statut, visibles ensemble. Alignée sur le badge, et sur le pluriel des filtres voisins (Confirmés/Absents/Terminés/Annulés) | ✅ |
| Empty state (aucun RDV, filtre par défaut) | "Prenez rendez-vous depuis la carte des institutions." | **Modifier** | "Prenez rendez-vous en explorant les établissements disponibles." | "La carte" évoque la vraie carte géographique (déjà utilisée ailleurs, "Carte des prestataires" sur l'Accueil) alors que le bouton juste en dessous mène à `/recherche` en vue Grille par défaut, pas la vue Carte — reformulé sans promettre une vue précise | ✅ |
| Modal Reporter — état de chargement du bouton | "..." | **Modifier** | "Report…" | Seul bouton asynchrone de tout l'écran à afficher un texte de chargement muet — tous les autres (Annulation…, Envoi…) nomment l'action en cours | ✅ |
| Prochain RDV — carte | "Prochain rendez-vous" / "Service : {objet}" / "Scanner mon QR" | Conserver | — | Clair | ✅ |
| Notifications — entrée | "{n} nouvelle(s) notification(s)" / "{n} message(s)" | Conserver | — | Pluriels corrects | ✅ |
| Détail RDV — sections | "Objet" / "Suivi" / "Motif d'annulation" / "Motif du report" / "Votre avis" / "Informations du rendez-vous" (Référence/Créé le/Date prévue/Dernière mise à jour) | Conserver | — | Clair, factuel | ✅ |
| Détail RDV — bannière info dynamique (6 variantes selon statut) | Ex. "Présentez-vous 10 minutes avant l'heure prévue avec votre QR code..." | Conserver | — | Chaque variante correspond précisément à un état réel, jamais un message générique | ✅ |
| Détail RDV — reçu / aide | "Télécharger le reçu" / "Besoin d'aide ?" | Conserver | — | Clair, garde-fou déjà en place (bouton visible seulement si un reçu existe réellement) | ✅ |
| Modal Annuler | "Annuler le RDV" / motifs rapides / "Ou écrivez votre motif..." / "Confirmer l'annulation" / "Annulation…" | Conserver | — | Clair | ✅ |
| Modal Reporter (hors chargement) | "Reporter le RDV" / "Nouvelle date" / "Nouvelle heure" / motifs rapides / "Confirmer le report" | Conserver | — | Clair | ✅ |
| Modal Avis | "Votre avis compte !" / échelle "Très mauvais"→"Excellent !" / "Envoyer mon avis" / "Enregistrer comme brouillon (à finir plus tard)" / "Merci pour votre avis !" | Conserver | — | Chaleureux, échelle claire | ✅ |
| Sheet Aide (3 sections) | Explications Suivi/Informations/Reçu | Conserver | — | Très transparent sur les limites de données historiques ("la date exacte n'a pas été enregistrée à l'époque, jamais une date approximative n'est affichée à la place") — exactement le niveau d'honnêteté visé par ce chantier | ✅ |

### Comparaison au standard international (Étape 6)

- **Chip de filtre vs badge de statut désynchronisés** : ce genre d'écart
  n'est visible qu'en regardant le filtre ET son contenu ensemble — un
  test qui ouvre chaque écran isolément ne l'aurait pas forcément
  remarqué.
- **Bouton de chargement muet repéré par comparaison systématique** :
  balayer tous les états `actionLoading` de l'écran a suffi à repérer le
  seul bouton sur 5 qui ne nomme pas l'action en cours.

### Points nécessitant une validation

Aucun.

### Observations hors périmètre

Aucune.

### Implémentation

Fichier modifié : `app/mes-rdv/page.tsx` (3 chaînes de texte). Rendu
réel non vérifié dans un navigateur (aucun outil navigateur disponible
dans cet environnement) : à confirmer visuellement par Bryan. `npx tsc
--noEmit` : à confirmer par Bryan (voir note écran 01).

---

## Écran 12 — Prise de rendez-vous (`app/rdv/[id]/page.tsx`)

### Contexte

1267 lignes. Tunnel de réservation complet : sélection du service,
calendrier, créneau, récapitulatif, informations complémentaires, écran
de succès (QR + code de confirmation), modale "intention de sortie"
(ExitIntentModal, feedback d'abandon).

### Inventaire, évaluation et décisions (résumé)

| Élément | Texte actuel | Décision | Nouveau texte | Justification | Statut |
|---|---|---|---|---|---|
| Écran succès — lien/bouton vers le QR | "Mon QR" (×2 : texte + bouton) | **Modifier** | "Mon QR code" | Le nom canonique de cette destination est "Mon QR Code" (titre réel de l'écran `/mon-qr`, à corriger en "Mon QR code" — voir écran 14) ; cet écran l'abrégeait en "Mon QR" tout court, 4e variante du même nom trouvée dans l'app | ✅ |
| Récapitulatif — liens légaux | "Conditions Générales d'Utilisation" / "Politique de Confidentialité" | **Modifier** | "Conditions d'utilisation" / "Politique de confidentialité" | Casse Titre incohérente avec la casse phrase utilisée partout ailleurs pour ces deux mêmes documents (inscription, menu Compte "Mentions légales") | ✅ |
| Modale "Vous partez déjà ?" | Titre + texte + raisons rapides + "Reprendre ma réservation" / "Envoyer et quitter" / "Quitter sans répondre" | Conserver | — | Ton posé et respectueux ("Rien ne presse et vous êtes libre à tout moment"), jamais culpabilisant | ✅ |
| Étape Service | "Que souhaitez-vous faire aujourd'hui ?" / "Sélectionnez le service correspondant à votre besoin." | Conserver | — | Clair | ✅ |
| Carte service | "Payant"/"Gratuit" / "Voir les détails"/"Masquer les détails" / "Choisir ce service" | Conserver | — | Clair | ✅ |
| Étapes Date/Horaire | "Choisir une date" / "Choisir un horaire" / "Dernières places" / "Complet" | Conserver | — | Le badge "Disponible" par défaut a été volontairement retiré (retour Bryan) — n'affiche que ce qui mérite vraiment l'attention | ✅ |
| Récapitulatif | "Récapitulatif" / "Vérifiez avant de confirmer." / "Modifier" (par ligne) / "Pour un tiers" / "Demande spéciale" | Conserver | — | Chaque ligne a son propre "Modifier" — retour terrain explicite documenté dans le code | ✅ |
| Récapitulatif — info prix | "Prix en Franc Guinéen (GNF)... Yelen n'ajoute aucun frais ni majoration." | Conserver | — | Vérifié dans le code (taux_taxe jamais ajouté au prix citoyen), pas une supposition | ✅ |
| Récapitulatif — politique d'annulation | "Vous pouvez annuler ou reporter ce rendez-vous à tout moment depuis Mes RDV, sans frais." | Conserver | — | Vérifié réel (aucune limite de délai/frais côté code) avant d'être affirmé | ✅ |
| Écran succès | "Rendez-vous confirmé" / "Code de confirmation Yelen" / "Prochaines étapes" (3 repères) | Conserver | — | Repères basés sur des mécanismes réellement vérifiés (rappels automatiques en prod), pas des promesses vagues | ✅ |

### Comparaison au standard international (Étape 6)

- **4e variante de "Mon QR" repérée** — la vigilance construite au fil
  des écrans précédents (3 occurrences de "Mon QR Code" déjà corrigées)
  a permis de repérer immédiatement une 4e variante différente ("Mon
  QR" sans "code") plutôt que de la lire comme acceptable par lassitude.
- **Casse Titre vs casse phrase sur les mêmes documents légaux** :
  incohérence typographique pure, invisible en lisant cet écran seul,
  visible seulement en comparant à l'écran d'inscription — exactement le
  type de vérification que ce chantier est censé faire système par
  système.
- **Discipline "vérifié dans le code, pas une supposition"** répétée
  deux fois dans les commentaires de cet écran (prix, politique
  d'annulation) — le niveau de rigueur factuelle visé par ce chantier
  est déjà la norme ici.

### Points nécessitant une validation

Aucun.

### Observations hors périmètre

Aucune.

### Implémentation

Fichier modifié : `app/rdv/[id]/page.tsx` (4 chaînes de texte : 2 pour
"Mon QR code", 2 pour la casse des liens légaux). Rendu réel non
vérifié dans un navigateur (aucun outil navigateur disponible dans cet
environnement) : à confirmer visuellement par Bryan. `npx tsc --noEmit` :
à confirmer par Bryan (voir note écran 01).

---

## Écran 13 — Messagerie citoyen (`app/messagerie/citoyen/page.tsx`)

### Contexte

1568 lignes. Deux onglets : "Établissements" (conversations liées à un
RDV, historique) et "Yelen" (ticketing Support Yelen, agent humain
uniquement — chantier documenté dans CLAUDE.md). En-tête de fichier
impose un vocabulaire strict côté citoyen : jamais "ticket"/"demande",
jamais un message évoquant une IA.

### Verdict général

**1 seule modification, typographique.** C'est l'écran le plus
discipliné éditorialement rencontré jusqu'ici — l'en-tête de fichier
impose déjà lui-même l'essentiel des critères de ce chantier (vocabulaire
humain, jamais de dossier administratif, jamais un message d'erreur sec).

### Inventaire, évaluation et décisions (résumé)

| Élément | Texte actuel | Décision | Nouveau texte | Justification | Statut |
|---|---|---|---|---|---|
| Sheet d'évaluation — question | "Qu'avez-vous particulièrement apprécié ?" (apostrophe courbe ') | **Modifier** | Même texte, apostrophe droite (') | Seule occurrence d'apostrophe courbe dans un fichier qui en utilise ~25 tout du long, toutes droites (`'` ou `&apos;`) — incohérence typographique isolée | ✅ |
| Bandeaux de statut (4 variantes) | "En attente d'un agent" / "Vous êtes maintenant en contact avec Yelen." / "Votre problème est résolu" / "Conversation terminée" | Conserver | — | Vocabulaire 100% humain, jamais "ticket" — conforme à l'instruction en tête de fichier | ✅ |
| Carte d'attente (paliers) | "Un agent Yelen arrive bientôt." → "Nous sommes désolés pour cette attente." selon la durée réelle écoulée | Conserver | — | Paliers dérivés du vrai timestamp de création, jamais un minuteur qui repart de zéro | ✅ |
| Formulaire nouvelle demande | "DE QUOI AVEZ-VOUS BESOIN ?" / "EN QUELQUES MOTS" / "VOTRE MESSAGE" / "Parler au support" | Conserver | — | Jamais "Nouveau ticket" (vocabulaire explicitement interdit) | ✅ |
| Alerte conversation déjà active | "Vous avez déjà une conversation en attente" / "Vous êtes déjà en conversation avec un agent" | Conserver | — | Explique pourquoi une 2e conversation n'est pas nécessaire, ton rassurant | ✅ |
| Confirmation "Terminer le chat" | "Terminer cette conversation ?" / "Continuer la conversation" / "Terminer le chat" | Conserver | — | Vraie modale de confirmation (jamais `window.confirm`, conforme YELEN_UX_RULES) | ✅ |
| Sheet évaluation | "Comment était votre expérience avec le support Yelen ?" / échelle dynamique / "Un commentaire ?" / "Merci pour votre avis." | Conserver | — | Non obligatoire (fermable au tap sur le fond), jamais forcée | ✅ |
| États vides (Établissements/Yelen) | "Aucune conversation pour l'instant" / "Besoin d'aide ?" + illustrations dédiées | Conserver | — | Chaleureux, jamais un simple "Vide" | ✅ |

### Comparaison au standard international (Étape 6)

- **Vocabulaire imposé en amont du code plutôt que découvert en
  audit** : ce fichier est le premier de tout le chantier où les règles
  éditoriales (jamais "ticket", jamais un ton robotique, support 100%
  humain) sont écrites noir sur blanc dans l'en-tête du fichier avant
  même la première ligne de JSX — la relecture confirme qu'elles sont
  bien respectées partout, pas seulement énoncées.
- **Seule anomalie trouvée : une apostrophe** — après plusieurs écrans
  avec de vraies incohérences de fond, ce résultat quasi-parfait est
  documenté tel quel plutôt que gonflé artificiellement.

### Points nécessitant une validation

Aucun.

### Observations hors périmètre

Aucune.

### Implémentation

Fichier modifié : `app/messagerie/citoyen/page.tsx` (1 caractère).
Rendu réel non vérifié dans un navigateur (aucun outil navigateur
disponible dans cet environnement) : à confirmer visuellement par Bryan.
`npx tsc --noEmit` : à confirmer par Bryan (voir note écran 01).

---

## Écran 14 — Mon QR code (`app/mon-qr/page.tsx`)

### Contexte

1038 lignes. Deux sous-onglets (Gratuit/Payant), génération et affichage
du QR (ou code à 6 chiffres pour le payant), déclaration de remise de
paiement, historique des scans, détail d'un passage.

### Verdict général

Écran le plus corrigé du chantier jusqu'ici en nombre d'occurrences —
**pas pour des problèmes de fond, mais une seule faute de casse répétée
14 fois** ("QR Code" → "QR code") plus 2 séparateurs manquants.

### Inventaire, évaluation et décisions (résumé)

| Élément | Texte actuel | Décision | Nouveau texte | Justification | Statut |
|---|---|---|---|---|---|
| Titre d'écran (`CompteHeader`) + 13 occurrences internes (placeholders, boutons, alt-text, labels) | "QR Code" / "Mon QR Code" partout dans ce fichier | **Modifier** (14 occurrences) | "QR code" / "Mon QR code" | "Code" est un nom commun en français, jamais capitalisé au milieu d'une phrase — c'est le même bug que "Mon QR Code" déjà corrigé sur 5 autres écrans (Accueil, menu Compte, recherche compte, tunnel RDV), ici présent quasi partout où le mot apparaît dans le fichier canonique de la fonctionnalité | ✅ |
| Bandeau sécurité (bas d'écran) | "QR Code chiffré  Expire automatiquement  Unique par RDV" (espaces doubles) | **Modifier** | "QR code chiffré · Expire automatiquement · Unique par RDV" | Séparateurs "·" manquants entre 3 faits juxtaposés — probablement perdus lors d'une édition, le caractère "·" est le séparateur standard utilisé partout ailleurs dans l'app pour ce genre de liste courte | ✅ |
| Étape 3 "Que faire avec ce code" | "Ne partagez pas ce code  il est personnel et unique" (espaces doubles) | **Modifier** | "Ne partagez pas ce code — il est personnel et unique" | Même défaut : séparateur manquant entre deux propositions, corrigé avec un tiret cadratin cohérent avec le style du fichier ("Dernière chance — ce code est...", ligne juste en dessous) | ✅ |
| QR actif — statut | "QR Code actif Expire dans {x}" (juxtaposé sans séparateur) | **Modifier** | "QR code actif · Expire dans {x}" | Même défaut de séparateur manquant | ✅ |
| Onglets Gratuit/Payant | "Gratuit" / "Payant" + compteurs | Conserver | — | Clair | ✅ |
| États vides | "Aucun rendez-vous payant à venir" / "Vous êtes à jour !" / "Aucun rendez-vous gratuit à venir" / "Aucun passage enregistré" | Conserver | — | Jamais un vide non expliqué, illustrations dédiées | ✅ |
| Déclaration de paiement | "Je remets le paiement" / case de confirmation obligatoire / "Confirmer" | Conserver | — | Montant jamais saisi librement (lecture seule), conforme à la double confirmation décidée par le CEO | ✅ |
| Historique des scans | "Historique des scans" / "Présence confirmée" / "Voir tout l'historique ({n}) →" | Conserver | — | Clair | ✅ |

### Comparaison au standard international (Étape 6)

- **Un seul bug de casse, mais partout** : contrairement aux écrans
  précédents où "QR Code" apparaissait une fois isolément, ce fichier —
  qui EST la destination canonique de la fonctionnalité — le répète
  14 fois. Corriger la source la plus citée en dernier (après avoir déjà
  aligné 5 autres écrans dessus) garantit que la référence elle-même est
  maintenant correcte, pas seulement ses miroirs.
- **2 séparateurs "·"/"—" perdus** : probablement une régression
  d'édition (un caractère invisible à l'écran, facile à perdre en
  copiant-collant du texte) — le genre de défaut qu'une relecture
  silencieuse ne remarque pas mais qu'une lecture à voix haute révèle
  immédiatement ("QR Code actif Expire dans 5 minutes" se lit mal).

### Points nécessitant une validation

Aucun.

### Observations hors périmètre

- Les messages d'expiration définitive du QR (`RDV_QR_EXPIRE_DEFINITIF_MESSAGE`,
  `lib/rdvGating.ts`) et les messages d'erreur renvoyés par l'API
  (`data.titre`/`data.message`) ne sont pas définis dans ce fichier — non
  relus dans cette passe, à couvrir si un futur chantier touche
  `lib/rdvGating.ts` directement.

### Implémentation

Fichier modifié : `app/mon-qr/page.tsx` (17 chaînes de texte : 14 pour la
casse "QR code", 3 pour les séparateurs manquants). Rendu réel non
vérifié dans un navigateur (aucun outil navigateur disponible dans cet
environnement) : à confirmer visuellement par Bryan. `npx tsc --noEmit` :
à confirmer par Bryan (voir note écran 01).

---

## Écran 15 — Fiche établissement publique (`app/institution/[id]/InstitutionPublicClient.tsx`)

### Contexte

2636 lignes — le plus gros fichier citoyen individuel du chantier après
`app/page.tsx`. Fiche complète d'un établissement : hero + CTA
(gratuit/payant/site/WhatsApp/téléphone, piloté par `lib/prestataireCapacites.ts`),
annonces, avis, horaires, services/chambres (mode Hôtel), équipements,
widget satisfaction plateforme, FAQ générique, questions au citoyen,
"Plus d'informations" (conditions/règles/mentions légales).

### Étendue de cette passe (honnêteté explicite)

Fichier trop volumineux pour une relecture ligne à ligne exhaustive dans
le temps de ce chantier. Couverts en détail : hero (titre, CTA, stats),
FAQ (5 questions, déjà revérifiées contre le code réel selon le
commentaire du fichier lui-même), section Avis (résumé, empty state),
widget satisfaction, "Poser une question"/"Toutes les questions",
"Établissement vérifié", "Plus d'informations", galerie chambre (mode
Hôtel). **Non relus en détail** : contenu des sections Contacts/Horaires/
Équipements/liste Services, et le contenu texte des sheets Conditions/
Informations importantes/Informations légales (ce sont les
propres textes saisis par chaque institution, pas des libellés fixes de
l'app — hors du périmètre "texte produit" de ce chantier par nature).

### Inventaire, évaluation et décisions

| Élément | Texte actuel | Décision | Nouveau texte | Justification | Statut |
|---|---|---|---|---|---|
| Titre section Hôtel | "Expérience & Services" | **Modifier** | "Expérience et services" | Esperluette dans un vrai titre de section (`SectionTitle`, icône + couleur), pas un badge compact — même règle qu'écrans 01/08. Un commentaire du code voisin (ligne ~2325) confirme qu'un autre libellé "Équipements & règles" a déjà été jugé "trompeur" et retiré pour la même famille de raison — cohérent avec une pratique déjà en place dans ce fichier | ✅ |
| FAQ (5 questions) | Contenu générique sur réservation/annulation/avis/confidentialité | Conserver | — | Le commentaire du fichier documente une revérification ligne par ligne contre le code réel (09/08/2026) — 2 fausses promesses déjà retirées à l'époque ("confirmation immédiate", "annulation jusqu'à l'heure précise") | ✅ |
| FAQ — feedback | "Cela vous a-t-il aidé ?" / "Merci pour votre retour !" / "Désolé que cette réponse générique n'ait pas suffi — l'établissement pourra mieux répondre à votre situation précise." | Conserver | — | Redirige intelligemment vers "Poser une question" plutôt que de laisser un citoyen bloqué sur une réponse générique | ✅ |
| Avis — empty state | "Aucun avis pour le moment" / "Prenez rendez-vous pour être le premier à laisser un avis." | Conserver | — | Cohérent avec "Soyez le premier" utilisé pour les questions | ✅ |
| Avis — politique | "Seuls les citoyens ayant effectué un rendez-vous peuvent laisser un avis. Les avis vérifiés sont marqués d'un badge." | Conserver | — | Factuel, correspond à la vraie contrainte (RLS/logique métier) | ✅ |
| Widget satisfaction plateforme | "Comment on s'en sort ?" / échelle d'accord en 5 points / "Merci pour votre retour" | Conserver | — | Évalue Yelen (pas l'institution), dismissible, ne réapparaît pas avant 30 jours | ✅ |
| Poser une question | "Soyez le premier à poser une question à cet établissement" / limite 2 questions affichée avant envoi / "N'incluez pas d'informations personnelles (nom, téléphone, etc.)." | Conserver | — | Avertissement de confidentialité explicite avant publication | ✅ |
| Établissement vérifié | "Certifié par l'équipe Yelen" / "L'identité et les documents officiels de cet établissement ont été contrôlés par l'équipe Yelen avant sa mise en ligne." | Conserver | — | Vérification réelle (admin + documents), pas décorative | ✅ |
| Plus d'informations | "Conditions de l'entreprise" / "Règles du séjour" (mode Hôtel) / "Informations importantes" / "Informations légales" | Conserver | — | Relabellisation Hôtel déjà justifiée dans le code (évite un libellé "trompeur") | ✅ |
| CTA hero | Piloté par `CTA_LABELS` (`lib/prestataireCapacites.ts`) | Non couvert | — | Labels définis dans un fichier `lib/` partagé avec d'autres écrans (recherche, etc.) — à traiter comme sa propre unité si un futur chantier y revient | — |

### Comparaison au standard international (Étape 6)

- **Deuxième confirmation qu'"esperluette réservée aux badges compacts"
  est déjà une pratique reconnue dans ce projet**, pas seulement une
  règle que ce chantier invente : le commentaire de code voisin
  documente un précédent quasi identique ("Équipements & règles" jugé
  trompeur et retiré).
- **FAQ déjà revérifiée contre le comportement réel du produit**, avec
  trace explicite des 2 fausses promesses retirées avant ce chantier —
  exactement la discipline visée ici, déjà appliquée par le passé sur ce
  fichier précis.

### Points nécessitant une validation

Aucun.

### Observations hors périmètre

Aucune (voir "Étendue de cette passe" ci-dessus pour les zones non
couvertes, qui ne sont pas des trouvailles mais des limites de temps).

### Implémentation

Fichier modifié : `app/institution/[id]/InstitutionPublicClient.tsx`
(1 chaîne de texte). Rendu réel non vérifié dans un navigateur (aucun
outil navigateur disponible dans cet environnement) : à confirmer
visuellement par Bryan. `npx tsc --noEmit` : à confirmer par Bryan (voir
note écran 01).

## Écran 16.5 — Mes paiements (`app/compte/paiements/paiements-client.tsx`)

### Contexte
Historique des réservations payantes et reçus Yelen, accessible depuis Mon Compte. Écran déjà passé par une correction éditoriale antérieure documentée en commentaire de code (finition 24/08/2026) : alignement de "Remboursé" (sémantique couleur) et de "Absent"/"Absence constatée" avec `mon-qr/page.tsx::paiementInfo()`.

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Titre | "Mes paiements" | Conservé | Clair, direct |
| Intro | "Historique de vos réservations payantes et de vos reçus Yelen." | Conservé | Précis |
| Compteur | "{n} payé{s} · {n} en attente" | Conservé | Séparateur déjà correct |
| État vide (titre) | "Rien à voir ici pour l'instant" | Conservé | Ton humain, cohérent avec les autres écrans "Rien pour l'instant" du produit |
| État vide (sous-texte) | "Dès votre premier service payant réservé, son suivi et son reçu apparaîtront ici." | Conservé | Naturel |
| Actions carte | "Voir l'historique" / "Télécharger le reçu" | Conservé | "Télécharger" aligné au verbe canonique établi (voir Écran 16 — Mes données) |
| Timeline (sheet) | "Réservation créée" / "Paiement déclaré par vous" / "Paiement confirmé par {institution}" / "Marqué absent par {institution}" / "Réservation annulée" / "Paiement remboursé" | Conservé | Déjà harmonisé avec mon-qr lors d'une correction antérieure (voir commentaire de code) |

### Comparaison au standard international (Étape 6)
Niveau Stripe/Apple Pay pour un historique de paiements : états, actions et timeline sont clairs et sans jargon. Aucun texte ne nécessite de retouche.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
Aucun changement de texte nécessaire — écran déjà conforme (bénéficie d'une correction éditoriale antérieure au 24/08/2026). Non vérifié dans un navigateur (aucun outil navigateur disponible dans cet environnement) ; `npx tsc --noEmit` à confirmer par Bryan (voir note écran 01).

## Écran 16.6 — Carte Yelen ID (`app/compte/carte-yelen/carte-yelen-client.tsx`)

### Contexte
Carte d'identité numérique du citoyen (Yelen ID), avec QR de partage et aperçu de "l'écosystème Yelen" à venir (fidélité, badges, événements — présenté honnêtement comme non actif sauf "Programme de fidélité"/"Badges & niveaux" qui pointent réellement vers Yelen Rewards).

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Nouveau texte | Justification |
|---|---|---|---|---|
| Toast erreur génération QR | "Impossible de générer le QR Code." | Corrigé | "Impossible de générer le QR code." | Bug systémique de casse "QR Code" déjà identifié sur ~20 occurrences dans le produit (mon-qr/page.tsx et autres) |
| `alt` de l'image QR | "QR Code Yelen ID" | Corrigé | "QR code Yelen ID" | Même bug de casse, texte d'accessibilité donc dans le périmètre "visible" (lecteur d'écran) |
| Bouton | "Partager ma carte" | Conservé | — | Clair |
| Section écosystème (titre) | "L'écosystème Yelen arrive" | Conservé | — | Honnête, pas une promesse déguisée en fonctionnalité active |
| Badge | "Bientôt" | Conservé | — | Cohérent avec le reste du produit |
| Texte modale QR | "Ce code identifie votre compte Yelen. Ne le partagez qu'aux personnes ou établissements de confiance." | Conservé | — | Clair, avertissement bien dosé |
| Label champ carte | "Identifiant Yelen" (alors que le concept est appelé "Yelen ID" partout ailleurs sur cet écran) | Conservé | — | Lecture en contexte : c'est un label de champ français au sein d'une grille de type carte d'identité (Sexe, Né(e) le, Profession, Ville, Email) — traduire ce champ précis en français reste cohérent avec ses voisins immédiats, alors que "Yelen ID" est le nom de marque utilisé ailleurs comme concept. Distinction jugée volontaire, pas une incohérence à corriger. |

### Comparaison au standard international (Étape 6)
Niveau Apple Wallet/Revolut pour une carte d'identité numérique : présentation honnête du "à venir", pas de survente. Après les 2 corrections de casse, aucun autre texte ne pose problème.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
2 corrections de casse appliquées ("QR Code" → "QR code", toast + alt image). Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan (voir note écran 01).

## Écran 16.7 — Établissements favoris (`app/compte/favoris/favoris-client.tsx`)

### Contexte
Liste des établissements favoris du citoyen, avec recherche, filtres par secteur, KPI (Favoris/Visités/Nouveaux/Ouverts), et carte enrichie par établissement (prochain créneau, temps d'attente moyen, distance, dernière visite).

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Titre | "Établissements favoris" | Conservé | Clair |
| Intro | "Retrouvez rapidement vos établissements préférés." | Conservé | Naturel |
| KPI | "Favoris" / "Visités" / "Nouveaux" / "Ouverts" | Conservé | Concis, cohérent |
| Placeholder recherche | "Rechercher un établissement…" | Conservé | Aligné avec la correction faite sur CompteRechercheOverlay (Écran 05b) |
| État vide (aucun favori) | "Aucun favori" / "Ajoutez vos établissements préférés afin de les retrouver rapidement et recevoir leurs annonces." | Conservé | Clair |
| CTA état vide | "Découvrir des établissements" | Conservé | Actionnable |
| État vide (recherche) | "Aucun résultat" / "Essayez une autre recherche ou modifiez vos filtres." | Conservé | Cohérent avec d'autres écrans à filtres |
| Confirmation retrait | "Retirer cet établissement de vos favoris ?" | Conservé (texte) | Le texte lui-même est clair ; le mécanisme `window.confirm()` est hors périmètre (voir Observations) |
| Card | "{n} avis", "Ouvert"/"Fermé", "{n} service(s)", "Prochain créneau : …", "~{n} min d'attente en moyenne" | Conservé | Naturel, pluriels corrects |
| Relatif visite | "Jamais visité" / "Visité aujourd'hui" / "Visité hier" / "Visité il y a N jours/semaines/mois/ans" | Conservé | Grammaticalement correct (pluriels gérés) |
| Badge | "Nouvelle annonce" | Conservé | Clair |
| Bouton carte | "Voir le profil" | Conservé | Terme cohérent avec le reste du produit |
| Toasts | "Session expirée, reconnectez-vous." / "Impossible de charger vos favoris." / "Lien copié." / "Impossible de retirer ce favori." | Conservé | Cohérents avec le reste du produit |

### Comparaison au standard international (Étape 6)
Niveau Google Maps/Yelp pour une liste de favoris enrichie : contenu informatif sans survendre, formulations naturelles. Aucun texte ne nécessite de retouche.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
`window.confirm()` natif utilisé pour la confirmation de retrait d'un favori (ligne 146), alors que d'autres chantiers récents du produit (ex. Mes démarches) ont explicitement banni `window.confirm` au profit d'une modale stylée maison. Non corrigé — sujet de comportement/composant, hors périmètre strict de ce chantier éditorial.

### Implémentation
Aucun changement de texte nécessaire. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 16.8 — Mes avis (`app/compte/mes-avis/mes-avis-client.tsx`)

### Contexte
Liste des avis publiés/brouillons du citoyen, avec KPI, filtres (note, réponse, masqués, brouillons), édition en pop-up, et réponses d'établissement affichées.

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Nouveau texte | Justification |
|---|---|---|---|---|
| Bouton pop-up édition (état chargement) | "…" (seul, sans verbe) | Corrigé | "Publication…" / "Enregistrement…" selon le contexte (brouillon ou non) | Incohérent avec la convention établie dans ce chantier (verbe + ellipse pour tout état de chargement de bouton — voir "Envoi…", "Génération…", "Report…" sur d'autres écrans) |
| Titre | "Mes avis" | Conservé | — | Clair |
| Intro | "Vos expériences partagées avec les établissements Yelen." | Conservé | — | Naturel |
| KPI | "Note moyenne" / "Publiés" / "Réponses" / "Établissements" | Conservé | — | Clair |
| Placeholder recherche | "Rechercher un établissement…" | Conservé | — | Cohérent |
| Filtres | "Tous" / "5★"…"1★" / "Avec réponse" / "Sans réponse" / "Masqués" / "Brouillons (N)" | Conservé | — | Concis et clair |
| État vide | "Aucun avis publié" / "Après chaque rendez-vous terminé, vous pourrez partager votre expérience afin d'aider les autres citoyens." | Conservé | — | Ton correct, invite sans culpabiliser |
| CTA état vide | "Voir mes RDV" | Conservé | — | Vocabulaire "RDV" cohérent avec le reste du produit |
| Card | "Publié le {date}" / "Brouillon non publié" / "{n} utile(s)" | Conservé | — | Naturel |
| Réponse établissement | "Réponse de {institution}" | Conservé | — | Clair |
| Actions | "Continuer" (brouillon) / "Modifier" / "Partager" / "Copier" / "Afficher"/"Masquer" / "Supprimer" | Conservé | — | Verbes clairs et cohérents |
| Confirmation suppression | "Supprimer définitivement cet avis ?" | Conservé (texte) | — | `window.confirm()` natif, même remarque hors périmètre que Favoris |
| Pop-up édition | "Continuer mon brouillon" / "Modifier mon avis" / "Titre (optionnel)" / "Commentaire (optionnel)" | Conservé | — | Clair |
| Toasts | "Avis publié." / "Brouillon mis à jour." / "Avis modifié." / "Avis copié." / etc. | Conservé | — | Cohérents |

### Comparaison au standard international (Étape 6)
Niveau Google/Yelp pour la gestion de ses propres avis : états de chargement désormais alignés avec le reste du produit après correction.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Même remarque que Favoris : `window.confirm()` natif pour la suppression d'un avis (ligne 164), hors périmètre de ce chantier éditorial.

### Implémentation
1 correction appliquée (texte de chargement du bouton pop-up édition). Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 16.9 — Activités passées (`app/compte/activites/activites-client.tsx`)

### Contexte
Timeline consolidée de toutes les activités du compte (RDV, QR, paiements, avis, favoris, documents), avec bilan périodique ("Membre depuis…", résumé du mois), filtres et fiche détail par activité.

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Nouveau texte | Justification |
|---|---|---|---|---|
| `CATEGORIE_LABEL.qr` | "QR Code" | Corrigé | "QR code" | Bug systémique de casse déjà documenté sur ~20 occurrences dans le produit |
| Titre | "Activités passées" | Conservé | — | Clair |
| Intro | "Retrouvez toutes les actions réalisées avec votre compte Yelen." | Conservé | — | Naturel |
| Bilan périodique | "Membre depuis {durée}." / "Il y a {durée}, vous rejoigniez Yelen." / "Aucune activité pour l'instant ce mois-ci." | Conservé | — | Ton chaleureux sans exagération, donnée réelle uniquement (voir commentaire de code) |
| KPI | "activités au total" / "Établissements" / "QR scannés" / "Paiements" / "Avis" | Conservé | — | Clair |
| Placeholder recherche | "Rechercher (établissement, service, mot-clé)…" | Conservé | — | Précis, aide à formuler la recherche |
| Filtres date/statut | "Aujourd'hui" / "7 jours" / "30 jours" / "Cette année" / "Succès" / "En attente" / "Annulé" / "Échec" | Conservé | — | Clair |
| État vide | "Aucune activité" / "Vos rendez-vous, paiements, scans QR et autres actions apparaîtront ici automatiquement." | Conservé | — | Rassurant, explique le mécanisme |
| Résultat vide (filtres) | "Aucun résultat pour ces filtres." | Conservé | — | Direct |
| Fiche détail — avertissement upload | "Assurez-vous de reconnaître cette demande avant d'envoyer un document sensible. En cas de doute, ne l'envoyez pas et signalez l'établissement." | Conservé | — | Avertissement de sécurité bien dosé, cohérent avec `documents-telecharges` |
| Actions fiche détail | "Voir mes rendez-vous" / "Voir l'établissement" / "Téléverser le document" / "Télécharger" / "Signaler cet établissement" / "Voir mes avis" / "Voir mes favoris" / "Fermer" | Conservé | — | Verbes clairs et cohérents avec le reste du produit |
| Chargement upload | "Envoi…" | Conservé | — | Cohérent avec la convention verbe + ellipse |

### Comparaison au standard international (Étape 6)
Niveau Google/Apple pour une timeline d'activité consolidée : bilan honnête (aucune statistique inventée, voir commentaire de code sur `bilan`), filtres clairs, fiche détail bien structurée. Après correction de casse, aucun autre texte ne pose problème.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
1 correction de casse appliquée ("QR Code" → "QR code" dans `CATEGORIE_LABEL`). Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 16.10 — Confidentialité (`app/compte/confidentialite/confidentialite-client.tsx`)

### Contexte
Centre de contrôle de la confidentialité : visibilité du profil, partage de données avec les établissements, état des autorisations navigateur (lecture seule), consentements CGU/politique, communications, et suppression de compte (flux "SUPPRIMER" + PIN).

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Nouveau texte | Justification |
|---|---|---|---|---|
| Description permission caméra | "Utilisée pour scanner les QR Codes." | Corrigé | "Utilisée pour scanner les QR codes." | Bug systémique de casse déjà documenté ~20 occurrences |
| Bouton "Accepter" (CGU, état chargement) | "…" | Corrigé | "Enregistrement…" | Incohérent avec la convention verbe + ellipse établie dans ce chantier |
| Bouton "Accepter" (politique confidentialité, état chargement) | "…" | Corrigé | "Enregistrement…" | Idem |
| Bouton "Supprimer définitivement" (état chargement) | "…" | Corrigé | "Suppression…" | Idem |
| Résumé confidentialité | "Très bien protégée" / "À vérifier" + textes associés | Conservé | — | Ton clair, sans culpabiliser, actionnable |
| Sections | "Visibilité" / "Partage des données" / "Autorisations" / "Consentements" / "Mes données" | Conservé | — | Titres directs |
| Champs visibilité | "Nom complet" / "Photo" / "Profession" / "Adresse" / "Email" / "Date de naissance" + descriptions | Conservé | — | Clair et cohérent |
| Ligne "Informations de réservation" | "Toujours activé — indispensable au fonctionnement de Yelen." | Conservé | — | Honnête, explique pourquoi ce switch est verrouillé |
| Autorisations navigateur | Labels "Autorisé"/"Refusé"/"Non demandé"/"Non disponible sur ce navigateur" + note explicative "Ces réglages se gèrent depuis les paramètres de votre navigateur…" | Conservé | — | Précis, gère bien la limite technique (lecture seule) |
| Consentements | "Acceptées — {date}" / "Non acceptées" / "Lire les CGU" / "Lire la politique" | Conservé | — | Clair |
| Suppression de compte | "Supprimer définitivement mes données" / pop-up "Supprimer définitivement votre compte ?" + texte légal complet | Conservé | — | Ton grave et clair, mention légale bien dosée sans jargon excessif |

### Comparaison au standard international (Étape 6)
Niveau Google/Apple pour un centre de confidentialité complet : granularité claire, honnêteté sur les limites techniques (permissions navigateur en lecture seule), suppression de compte avec friction proportionnée (texte à taper + PIN). Après corrections, aucun texte ne pose problème.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
4 corrections appliquées (1 casse "QR Codes"→"QR codes", 3 états de chargement de bouton alignés sur la convention verbe + ellipse). Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 16.11 — Sécurité (`app/compte/securite/securite-client.tsx`)

### Contexte
Centre de sécurité citoyen : score de sécurité (règles déterministes), PIN, biométrie WebAuthn, 2FA TOTP (mirroring du flux admin), appareils mémorisés, guide de sécurité. Écran déjà très rigoureux sur les états de chargement ("Enregistrement…", "Suppression…", "Vérification…", "Préparation…", "Désactivation…" déjà tous présents et cohérents avant ce passage).

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Nouveau texte | Justification |
|---|---|---|---|---|
| Bouton "Déconnecter tous les autres appareils" (état chargement) | "…" | Corrigé | "Déconnexion…" | Seul état de chargement de l'écran resté sans verbe — tous les autres boutons du même écran suivent déjà la convention verbe + ellipse |
| Score de sécurité | "Niveau de sécurité" + "Faible"/"Moyenne"/"Forte" + conseils dynamiques | Conservé | — | Clair, dérivé de règles déterministes (`lib/citoyenSecurite.ts`) |
| Verrouillage rapide | "Code PIN" / "Configuré"/"Non configuré" / "Empreinte / Face ID" / "{n} appareil(s) enregistré(s)"/"Non activée" | Conservé | — | Naturel, pluriels corrects |
| 2FA TOTP | "Application d'authentification" / "Activée — un code sera demandé à chaque connexion"/"Non activée" / "Notez vos codes de secours" + explication | Conservé | — | Clair, mirroring assumé du flux admin |
| Appareils mémorisés | "Aucun appareil mémorisé." / "Connecté le {date}" / badge "Cet appareil" | Conservé | — | Clair |
| Guide de sécurité | 4 conseils (ne jamais partager le PIN, Yelen ne le demande jamais, vérifier ses appareils, activer la biométrie) | Conservé | — | Utile, formulé simplement |
| Confirmations natives | "Retirer cet appareil biométrique ?" / "Déconnecter cet appareil mémorisé ?" / "Déconnecter tous les autres appareils mémorisés ?" | Conservé (texte) | — | `window.confirm()` natif, même remarque hors périmètre que Favoris/Mes avis |

### Comparaison au standard international (Étape 6)
Niveau Google/Apple pour un centre de sécurité : score actionnable, 2FA bien expliqué, appareils mémorisés avec identification claire de l'appareil courant. Après la correction, tous les états de chargement de l'écran sont désormais cohérents.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
3 occurrences de `window.confirm()` natif (révocation credential biométrique, révocation appareil, révocation de tous les appareils) — même remarque que sur Favoris/Mes avis, hors périmètre de ce chantier éditorial.

### Implémentation
1 correction appliquée (état de chargement du bouton "Déconnecter tous les autres appareils"). Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 16.12 — Informations personnelles (`app/compte/informations-personnelles/informations-client.tsx`)

### Contexte
Écran canonique de gestion du profil citoyen (voir CLAUDE.md, remplace l'ancien `/profil`), avec bandeau de confiance, intégration Yelen Rewards (profil complet = +150 points, bandeau de progression, succès affiché une fois), fiche en lecture seule (Identité/Coordonnées) et formulaire d'édition complet. Fichier exceptionnellement bien documenté par des commentaires de code datés et attribués à Bryan pour chaque décision de contenu.

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Titre | "Informations personnelles" | Conservé | Clair |
| Message de confiance | "Vos informations restent confidentielles" + explication | Conservé | Rassure sans survendre une garantie technique non vérifiée (décision explicite documentée dans le code, 18/07/2026) |
| Bouton | "Modifier mes informations" | Conservé | Clair |
| Succès profil complété | "Profil complété" / "Vous avez obtenu +150 points sur Yelen Rewards." / "Continuer mon parcours" / "Voir Yelen Rewards" | Conservé | Valeur réelle (accordée côté serveur), affichage honnête et non trompeur |
| Bandeau "Complétez votre profil" | "Encore {n} étape(s) pour compléter votre profil." + "+150 pts" | Conservé | Pluriel correct, valeur réelle |
| Sections lecture seule | "Identité" / "Coordonnées" + lignes Sexe/Date de naissance/Nationalité/Profession/Téléphone/Email/Adresse/Ville | Conservé | Clair, badges "VÉRIFIÉ"/"NON VÉRIFIÉ" honnêtes (email jamais vérifié dans Yelen aujourd'hui, décision documentée de ne pas le cacher) |
| "Pourquoi ces informations ?" | Paragraphe explicatif + liens "Gérer mes préférences"/"Politique de confidentialité"/"Conditions générales d'utilisation" | Conservé | Remplace un ancien "Gérer mon compte" générique par une explication de valeur (décision documentée 27/08/2026) |
| Formulaire d'édition | Labels "Prénom *"/"Nom *"/"Sexe"/"Date de naissance"/"Nationalité"/"Profession"/"Email"/"Adresse"/"Ville" + placeholders | Conservé | Clair |
| Bouton enregistrement | "Enregistrer" / "Enregistrement…" | Conservé | Cohérent avec la convention verbe + ellipse |
| Erreurs | "Prénom et nom sont obligatoires." / "La photo n'a pas pu être envoyée. Réessayez." / "Session expirée, reconnectez-vous." | Conservé | Clair |

### Comparaison au standard international (Étape 6)
Niveau Stripe/Notion pour un écran de profil avec gamification intégrée (Rewards) : aucune survente, badges de vérification honnêtes, formulation systématiquement justifiée dans le code par une décision réelle de Bryan. Aucun texte ne nécessite de retouche — l'un des écrans les mieux disciplinés du produit à ce jour.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
Aucun changement de texte nécessaire. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 16.13 — Vérification d'identité (`app/compte/verification-identite/verification-identite-client.tsx`, 833 lignes)

### Contexte
Flux complet de vérification d'identité (recto + verso + selfie), vrai pipeline avec revue admin (jamais d'auto-vérification), guide pas-à-pas par étape (sheet "avant de prendre la photo"), confirmation finale, et 3 états terminaux (vérifiée/en attente/refusée).

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Hero | "Vérifiez votre identité" / "Confirmez votre identité pour sécuriser votre compte Yelen et obtenir le badge « Vérifié » sur votre Yelen ID." / "Vos données d'identité restent privées" | Conservé | Clair, honnête |
| "Pourquoi vérifier" | 5 bénéfices ("Renforcer la sécurité…", "Obtenir le badge « Vérifié »"…) | Conservé | Concret, non survendu |
| "Votre document reste privé" | Colonnes PUBLIC/PRIVÉ + note explicative | Conservé | Distinction claire et rassurante |
| "Comment ça marche" | 3 étapes numérotées | Conservé | Clair |
| "Pièces demandées" | Liste + formats/taille | Conservé | Précis |
| Erreurs | "Document trop volumineux" / "Format non accepté" / "Vérification impossible" + messages associés | Conservé | Spécifiques, actionnables |
| Guide par étape (sheet) | "Avant de prendre la photo"/"Avant de choisir un fichier" + Do's/Don'ts par étape (recto/verso/selfie) | Conservé | Instructions concrètes et différenciées par étape |
| Confirmation finale | "Vérifiez vos documents" / "Assurez-vous que vos 3 photos sont nettes, complètes et lisibles avant l'envoi." | Conservé | Clair |
| Bouton envoi | "Envoyer pour vérification" / "Envoi…" | Conservé | Cohérent avec la convention verbe + ellipse |
| Suivi de progression (en attente) | "Document reçu" / "Vérification" / "Décision" (3 étapes, toujours la même étape active) | Conservé | Honnête — le backend n'a qu'un seul statut "en_attente", pas de fausse granularité inventée (voir commentaire de code) |
| État en attente | "Votre identité est en cours de vérification" + explications + "Vous pouvez quitter cette page…" | Conservé | Rassurant, précis sur le comportement asynchrone |
| État vérifiée | "Identité vérifiée" + date + rappel badge | Conservé | Clair |
| État refusée | "Document refusé" + motif réel ou message générique + "Réessayer" | Conservé | Le motif réel (saisi par l'admin) prime toujours sur un texte générique |
| Confidentialité (pied de page) | "Vos données sont protégées" + liens légaux | Conservé | Clair |

### Comparaison au standard international (Étape 6)
Niveau Stripe Identity/Persona pour un flux de vérification KYC : granularité honnête (pas de fausses sous-étapes), guidage pédagogique par type de document, distinction public/privé rassurante. Aucun texte ne nécessite de retouche — écran exemplaire.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
Aucun changement de texte nécessaire. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 16.14 — Mes démarches (`app/compte/mes-demarches/mes-demarches-client.tsx`, 1747 lignes + `suivis-section.tsx`, 123 lignes)

### Contexte
Le plus gros écran du produit côté citoyen : checklist personnelle libre (démarches + étapes), vues intelligentes (Aujourd'hui/À venir/En retard/Terminées), priorité, récurrence, rappels, historique append-only, FAQ intégrée, et section "Votre activité" (Suivis) alimentée par des faits réels uniquement. Écran déjà passé par plusieurs "Lots" de modernisation documentés en détail dans le code (24-26/08/2026), avec de nombreuses décisions CEO/Bryan citées explicitement.

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| FAQ intégrée (9 questions) | "Qu'est-ce que \"Mes démarches\" ?", "Quelle est la différence entre \"Terminée\" et \"Clôturée\" ?", etc. | Conservé | Réponses précises, honnêtes (ex. "Non. Lier un établissement... aucune donnée n'est partagée") |
| États vides | "Aucune démarche" / "Rien pour aujourd'hui" / "Rien à venir" / "Aucune démarche en retard" → "Tout est à jour — bien joué." / etc. | Conservé | Différenciés par filtre, ton juste (léger sur "bien joué", neutre ailleurs) |
| Guide "Comment ça marche ?" | 3 étapes explicatives | Conservé | Clair |
| Formulaire de création | "Titre de la démarche (obligatoire)" / "Catégorie" / "Établissement lié (optionnel)" / etc. + note "Seul le titre est obligatoire…" | Conservé | Précis sur ce qui est obligatoire vs optionnel |
| Confirmation "Démarche non organisée" | Message expliquant concrètement les conséquences (pas de détection "en retard" fiable, pas de progression visible) | Conservé | Pédagogique sans bloquer le choix du citoyen |
| Sheet détail | "Prochaine action" / "Échéance" / "Progression" / "Se répète : {récurrence}" / "Rappel : {n} jour(s) avant l'échéance" | Conservé | Clair, pluriels corrects |
| Célébration | "Bravo !" / "Vous avez terminé « {titre} ». Une discipline comme celle-ci construit une vie administrative bien gérée — continuez ainsi." | Conservé | Chaleureux sans excès, cohérent avec le ton Yelen |
| Blocage échéance | "Pas encore le moment" + explication ("Une échéance ne peut pas être marquée terminée avant d'être arrivée.") | Conservé | Explique clairement une règle métier autrement frustrante |
| Suppression | "Supprimer cette démarche ?" + détail (nombre d'étapes, historique) + "Cette action est irréversible" | Conservé | Friction proportionnée, passé en sheet dédié (pas de `window.confirm`, déjà corrigé par un Lot antérieur) |
| Bloc de clôture Yelen (bas de page) | "Yelen existe pour une seule raison : rendre l'accès aux services essentiels… aussi simple et digne que possible pour chaque citoyen guinéen. […] Yelen, c'est votre lumière dans vos démarches du quotidien." | Conservé | Signature de marque cohérente avec "Yelen" = lumière (CLAUDE.md /identite) |
| Suivis ("Votre activité") | "Analyse de votre activité…" (chargement) / "Rien à signaler pour l'instant." / "Dès qu'il y aura quelque chose d'utile à vous dire, ça apparaîtra ici." | Conservé | Honnête, aucune donnée inventée (voir commentaire de code) |

### Comparaison au standard international (Étape 6)
Niveau Todoist/Apple Reminders pour une checklist personnelle avec gamification légère (célébration) : granularité honnête, vocabulaire précis (Terminée vs Clôturée bien distingué dans la FAQ elle-même), aucune donnée inventée dans la section Suivis. Aucun texte ne nécessite de retouche sur l'écran le plus complexe du produit côté citoyen.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
Aucun changement de texte nécessaire sur les deux fichiers. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

---

**Écran 16 (Écrans /compte/* à contenu réel) — clos.** 14 fichiers audités au total (informations-personnelles, sécurité, confidentialité, activités, mes-avis, favoris, paiements, carte-yelen, mes-donnees, notifications, parcours-yelen, langue, verification-identite, mes-demarches + suivis-section). Bilan : 4 occurrences du bug systémique "QR Code"→"QR code" corrigées (carte-yelen ×2, activités, confidentialite), 5 états de chargement de bouton alignés sur la convention verbe + ellipse (mes-avis, confidentialite ×3, sécurité), 0 autre changement nécessaire — le dossier `/compte/*` est globalement d'un niveau éditorial déjà élevé, avec une discipline de documentation (commentaires de code datés et attribués) qui dépasse largement le reste du produit.

## Écran 17.1 — Calculatrice financière (`app/menu/calculatrice/calculatrice-client.tsx` + `microcredit/page.tsx` + `epargne/page.tsx`)

### Contexte
"Vos outils financiers" (chantier engagement 25/07/2026) : liste de 6 outils dont 2 seulement ont un vrai contenu sourcé (microcrédit, épargne), les 4 autres honnêtement affichés "Bientôt disponible" plutôt qu'inventés. Chiffres et taux systématiquement sourcés (Crédit Rural de Guinée, OMIG Tik Tak, IMF type BSIC).

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Titre liste | "Vos outils financiers" | Conservé | Clair |
| Outils "Bientôt" | "Consolidation de dettes" / "Croissance d'investissement" / "« Et si j'avais investi »" / "Suivi de mon crédit" → "Bientôt disponible." | Conservé | Honnête, aucun contenu inventé pour combler |
| Microcrédit (hero) | "Estimez la mensualité d'un crédit dégressif, façon Crédit Rural de Guinée" | Conservé | Précis, source citée dans le texte lui-même |
| Microcrédit (disclaimer) | "Des frais additionnels peuvent s'ajouter selon l'institution […] à vérifier avant signature." + sources en lien | Conservé | Prudent, sourcé, ne prétend pas remplacer un vrai devis |
| Épargne (hero) | "Tontine, épargne mobile ou IMF — trois scénarios réels, pas un taux inventé" | Conservé | Revendique explicitement l'honnêteté des données, cohérent avec le reste du produit |
| Épargne (disclaimer) | "Une tontine n'offre pas d'intérêt (0%) […] pas une moyenne nationale supposée." | Conservé | Précis, évite toute généralisation trompeuse |

### Comparaison au standard international (Étape 6)
Niveau Mint/Bankrate pour des simulateurs financiers grand public : chaque donnée est sourcée et vérifiable, aucune moyenne nationale inventée, "Bientôt disponible" plutôt qu'un contenu de remplissage. Aucun texte ne nécessite de retouche.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
Aucun changement de texte nécessaire sur les 3 fichiers. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 17.2 — Leçons d'argent (`app/menu/lecons-argent/lecons-argent-client.tsx` + `[id]/page.tsx`)

### Contexte
Liste de leçons financières par catégorie (Épargne, Mobile money, Crédit, Revenus, Budget, Fraudes) + quiz interactif par leçon, chaque question sourcée individuellement (recherches réelles, affichées comme référence type consumerfinance.gov). Progression V1 en mémoire uniquement, honnêtement non persistée (décision documentée).

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Titre | "Leçons d'argent" | Conservé | Clair |
| Filtre catégories | "Toutes" + labels de `CATEGORIES` | Conservé | Clair |
| CTA carte leçon | "{n} questions" / "Commencer" | Conservé | Direct |
| État vide catégorie | "Aucune leçon dans cette catégorie pour l'instant." | Conservé | Honnête |
| Quiz — feedback réponse | "Correct !" / "Pas tout à fait" / "La bonne réponse : {texte}" + explication + "Source : {label}" | Conservé | Pédagogique, chaque affirmation sourcée individuellement |
| Quiz — CTA | "Suivant" / "Terminer" | Conservé | Clair |
| Fin de leçon | "Bravo, leçon terminée !" / "Vous avez terminé « {titre} »." / "Retour aux leçons" | Conservé | Ton juste, sans survente |
| Leçon introuvable | "Cette leçon n'existe pas." | Conservé | Direct |

### Comparaison au standard international (Étape 6)
Niveau Duolingo/NerdWallet pour un quiz éducatif financier : chaque fait sourcé individuellement, célébration proportionnée, honnêteté sur l'absence de persistance (non visible côté texte mais cohérent avec le reste du produit). Aucun texte ne nécessite de retouche.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Le contenu réel des leçons (`lib/leconsArgent.ts` — questions, explications, sources) n'a pas été relu exhaustivement dans cette passe (fichier de données, déjà sourcé par recherche dédiée au chantier d'origine du 25/07/2026) — seule la couche d'interface (labels, feedback, navigation) a été auditée ici, par souci d'honnêteté sur le périmètre réellement couvert.

### Implémentation
Aucun changement de texte nécessaire sur les 2 fichiers d'interface. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 17.3 — Vos centres d'intérêt (`app/menu/interets/interets-client.tsx`)

### Contexte
Sélection multi-chips des centres d'intérêt du citoyen (réutilise la taxonomie réelle secteurs + catégories Leçons d'argent), avec détection de modification réelle avant d'activer "Enregistrer"/"Modifier" et confirmation avant de quitter sans enregistrer.

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Titre | "Vos centres d'intérêt" | Conservé | Clair |
| Accroche | "Qu'est-ce qui compte pour vous ?" / "Vous pouvez en choisir plusieurs, revenir modifier quand vous voulez, et ça ne touche jamais à vos rendez-vous en cours." | Conservé | Rassure sur un point précis et réel (aucun lien avec les RDV) |
| Bouton principal | "Enregistrer" / "Modifier" / "Enregistrement…" | Conservé | Cohérent avec la convention verbe + ellipse, verbe change selon l'état réel (déjà enregistré ou non) |
| Confirmation quitter | "Enregistrer avant de quitter ?" / "Vous avez changé votre sélection sans l'enregistrer. Sans ça, ces changements seront perdus." / "Enregistrer et quitter" / "Annuler" | Conservé | Clair, friction proportionnée à une vraie perte de données |
| Toast | "Centres d'intérêt enregistrés." | Conservé | Clair |

### Comparaison au standard international (Étape 6)
Niveau Spotify/Netflix pour un écran de personnalisation par intérêts : accroche humaine, rassurance sur les effets de bord (pas de RDV touché), détection réelle de modification. Aucun texte ne nécessite de retouche.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
Aucun changement de texte nécessaire. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 17.4 — Vos tendances (`app/menu/vos-tendances/vos-tendances-client.tsx`)

### Contexte
Statistiques 100% dérivées de l'activité réelle du citoyen (RDV, favoris, avis, démarches), zéro score composite (décision actée dans le plan rétention v2 : jamais de score numérique visible), méthodologie expliquée explicitement en bas d'écran ("D'où viennent ces chiffres").

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Nouveau texte | Justification |
|---|---|---|---|---|
| Méthodologie (bloc "D'où viennent ces chiffres") | "Votre secteur, votre adresse et votre jour « préférés » ?" | Corrigé | "Votre secteur, votre établissement et votre jour « préférés » ?" | Incohérence réelle : la carte correspondante (`Illu.etablissement`) affiche "Là où vous allez le plus" — un établissement le plus visité, pas une adresse. Le texte explicatif nommait la mauvaise donnée. |
| Titre | "Vos tendances" | Conservé | — | Clair |
| Accroche | "Vos vrais chiffres sur Yelen. Rien d'inventé, rien de deviné." | Conservé | — | Revendique l'honnêteté du chantier, cohérent |
| État vide | "Rien à montrer pour l'instant. Prenez votre premier RDV, et on vous montre vos tendances ici." | Conservé | — | Clair, actionnable |
| Cartes KPI | "Rendez-vous" / "Favoris" / "Avis ({n}★ moy.)" / "Démarches en cours" | Conservé | — | Direct |
| Graphique | "Vos RDV, mois par mois" | Conservé | — | Clair |
| Cartes "top" | "Votre secteur préféré" / "Là où vous allez le plus" / "Le jour où vous venez le plus" | Conservé | — | Naturel, seuil de 3 RDV avant affichage (évite un "motif" tiré d'un seul point de donnée, voir commentaire de code) |
| CTA Leçons d'argent | "Envie d'y voir plus clair sur votre argent ?" / "Nos leçons expliquent le crédit et l'épargne simplement, avec des vraies infos sur la Guinée." | Conservé | — | Ton direct, engageant sans être intrusif |
| "Sur Yelen depuis {durée}" | — | Conservé | — | Clair |
| Méthodologie (reste) | "On compte. C'est tout." / "Pas d'IA ici. Pas de note sur 100. Et on ne vous compare à personne — juste vous, et vos chiffres." | Conservé | — | Formulation forte et cohérente avec la philosophie "zéro score visible" du produit |

### Comparaison au standard international (Étape 6)
Niveau Spotify Wrapped/Strava pour des statistiques personnelles honnêtes : méthodologie explicitée en clair, aucun score inventé, seuils statistiques respectés (3 RDV minimum). Après correction du terme erroné, aucun autre texte ne pose problème — un des écrans les plus rigoureux sur l'honnêteté des données du produit.

### Points nécessitant une validation
Aucun — correction mineure et non ambiguë (le texte nommait la mauvaise donnée par rapport à la carte affichée juste au-dessus).

### Observations hors périmètre
Aucune.

### Implémentation
1 correction appliquée ("votre adresse" → "votre établissement" dans le texte de méthodologie, pour correspondre à la donnée réellement affichée). Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 17.5 — Yelen Rewards (`app/menu/recompenses/recompenses-client.tsx` + `historique/historique-client.tsx`)

### Contexte
Programme de points Yelen (refonte V2, 22/08/2026) : solde, prochain objectif, 3 paliers de récompense, règles "Comment progresser" régénérées depuis `reward_rules` (jamais une liste statique périmée), historique paginé. Discipline d'honnêteté particulièrement poussée : jamais le mot "disponible" pour un palier dont le circuit de délivrance n'existe pas réellement, jamais de niveau/statut inventé.

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Header | "Yelen Rewards" | Conservé | Nom de marque cohérent |
| Solde | "{n} Points Yelen" + delta hebdo ("+{n} cette semaine" / "Aucune activité cette semaine") | Conservé | Clair |
| Acquis identité/profil | "Identité vérifiée" / "Profil complet" | Conservé | Factuel |
| Prochain objectif | "Il vous reste {n} points" / "Comment progresser →" | Conservé | Actionnable |
| Textes par type de palier | "offre_partenaire"/"badge_symbolique"/"paiement_especes" — intro + détail complets (ex. "Ce palier débloque 30 000 GNF, un paiement réel. […] ce circuit n'est pas encore ouvert, mais votre déblocage reste acquis […]") | Conservé | Honnêteté remarquable sur l'état réel du circuit de délivrance, jamais survendu |
| États palier | "Acquis — à réclamer auprès de Yelen" / "Acquis — récompense en préparation" / "Proche — plus que {n} pts" / "{n} points restants" | Conservé | Précis, "disponible" jamais employé par erreur |
| Textes par règle (`TEXTE_REGLE`) | 6 règles avec phrases humaines dédiées (ex. "Vous vous présentez à votre rendez-vous et votre présence est confirmée sur place.") | Conservé | Remplace un texte technique de migration qui s'affichait par erreur avant correction (retour Bryan 22/08/2026, voir commentaire de code) |
| Plafond anti-abus | "{n}/{limite} ce mois-ci" / "Plafond atteint pour cette période" / "Limité à {limite} fois par {jours} jours" | Conservé | Transparent, évite un abus perçu comme injuste |
| État vide activité | "Rien à afficher pour l'instant" / "Vos points apparaîtront ici dès votre première action réelle sur Yelen." | Conservé | Honnête |
| Historique — état vide | "Aucune activité pour le moment." | Conservé | Clair |
| Historique — pagination | "Charger plus" / "Chargement…" | Conservé | Cohérent avec la convention verbe + ellipse |

### Comparaison au standard international (Étape 6)
Niveau Sephora Beauty Insider/Starbucks Rewards pour un programme de fidélité, avec un niveau d'honnêteté rarement vu même chez ces références (aucun statut "disponible" sans circuit réel, jamais de faux niveau). Aucun texte ne nécessite de retouche — écran exemplaire.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
Aucun changement de texte nécessaire sur les 2 fichiers. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 17.6 — Mes dépenses (`app/menu/depenses/depenses-client.tsx`, 1560 lignes + `calendrier-depenses.tsx`, 152 lignes)

### Contexte
Le plus complet des écrans financiers : dépenses manuelles + RDV payés Yelen combinés, budgets (global + par catégorie), objectifs financiers avec contributions, rythme quotidien/mensuel, prévisions linéaires déterministes, insights "À surveiller" (zéro LLM), analyse mensuelle comparative, vue calendrier. Chantier engagement 25/07/2026, inspiré MoneyLion, 15 "Lots" successifs documentés en détail dans le code.

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| État vide global | "Rien à afficher pour l'instant. Ajoutez une dépense (passée ou à venir), ou prenez un rendez-vous payant sur Yelen — il apparaîtra ici automatiquement." | Conservé | Explique le mécanisme automatique |
| Objectif mensuel (défini) | "{n} restant sur votre objectif mensuel" / "Objectif mensuel dépassé de {n}" / "≈ {n}/jour jusqu'au {date}" | Conservé | Clair, actionnable |
| Action recommandée (4 tons) | "Vous avez dépassé votre budget {catégorie} ce mois-ci." / "Votre objectif mensuel est dépassé de {n}." / "À ce rythme, vous devriez dépasser votre objectif mensuel de {n} d'ici le {date}." / "Tout est sous contrôle ce mois-ci, continuez ainsi." | Conservé | Priorité déterministe et fixe (jamais un score inventé, voir commentaire de code), ton proportionné à la gravité |
| Votre rythme | "Vous avez dépensé {n} en {j} jour(s)." + "Votre rythme actuel est supérieur/en dessous de votre objectif." + conseil ciblé | Conservé | Seuil ±10% documenté pour éviter un ton alarmiste sur un écart minime |
| Mes objectifs (état vide) | "Économiser pour un loyer, un voyage, une réserve… Créez un objectif et suivez votre progression ici." | Conservé | Exemples concrets et réalistes pour le contexte guinéen |
| Prévisions | "À ce rythme, vous devriez atteindre environ {n} d'ici le {date}." / "Soit {n} de plus que votre objectif mensuel." | Conservé | Projection linéaire simple explicitement qualifiée de déterministe (pas de ML, voir commentaire) |
| Sheets de confirmation (5 actions) | "Modifier cette dépense ?" / "Ajouter cette dépense ?" avec récapitulatif complet avant validation / "Retirer ce budget ?" / "Supprimer cet objectif ?" / "Supprimer cette dépense ?" | Conservé | Friction proportionnée, jamais un "Êtes-vous sûr ?" vide (voir commentaire de code sur ce choix explicite) |
| Confidentialité (fiche détail) | "Ces détails restent privés. Ils nous aident seulement à vous proposer, plus tard, des recommandations qui correspondent à votre vraie activité." | Conservé | Honnête sur l'usage futur, pas de survente |
| Dépense récurrente | "Yelen vous rappellera cette dépense à chaque échéance ; vous pourrez l'enregistrer à nouveau en un geste depuis son détail." / "J'ai payé — enregistrer et renouveler" | Conservé | Clair sur le mécanisme |
| Calendrier | "Touchez un jour pour voir le détail." / "Aucune dépense ce jour-là." | Conservé | Direct |

### Comparaison au standard international (Étape 6)
Niveau MoneyLion/YNAB pour un centre de pilotage budgétaire complet : recommandations déterministes priorisées, prévisions non-ML clairement qualifiées comme telles, confirmations avec récapitulatif avant toute action. Aucun texte ne nécessite de retouche sur l'écran le plus dense du produit côté citoyen.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
Aucun changement de texte nécessaire sur les 2 fichiers. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

---

**Écran 17 (Écrans /menu/* à contenu réel) — clos.** 7 groupes de fichiers audités (calculatrice+2 sous-pages, leçons d'argent+quiz, interets, vos-tendances, recompenses+historique, depenses+calendrier). Bilan : 2 corrections réelles (1 incohérence de terminologie "adresse"→"établissement" sur Vos tendances, déjà comptée), le reste déjà d'un niveau éditorial très élevé — discipline d'honnêteté remarquablement poussée sur l'ensemble du dossier `/menu/*` (zéro donnée inventée, zéro promesse non tenue, sources citées systématiquement).

## Écran 18 — Écrans légaux/statiques (CGU, Confidentialité, Mentions légales, Politique de cookies, Conditions prestataires, Conditions des Offres)

### Contexte
6 documents légaux/contractuels : `app/cgu/page.tsx`, `app/confidentialite/page.tsx`, `app/mentions-legales/mentions-legales-client.tsx`, `app/politique-cookies/page.tsx`, `app/conditions-prestataires/page.tsx` (contrat B2B prestataires/institutions), `app/offres/conditions/conditions-offres-client.tsx`. Nature différente du reste du chantier : ce sont des textes à portée contractuelle/réglementaire (adresses de sièges sociaux, tarifs d'abonnement, clauses de juridiction, RGPD/cookies), pas de la copie produit — le registre formel y est approprié et attendu, contrairement au ton "humain et évident" recherché ailleurs dans ce chantier.

### Méthodologie adaptée à ce type de contenu
Conformément au principe "zéro donnée inventée" du protocole (CLAUDE.md `/protocole`), aucune réécriture de substance légale/factuelle n'a été effectuée (adresses, tarifs, clauses de juridiction, structure de responsabilité) : ces éléments engagent juridiquement Yelen224/Sempya224 et ne relèvent pas d'un choix éditorial de formulation. La revue s'est limitée à repérer des erreurs de pure forme (orthographe, casse, liens cassés) — comme sur le reste du chantier — sans jamais modifier le fond.

### Constats

| Élément | Constat | Décision | Justification |
|---|---|---|---|
| Lien "Politique des cookies" | `href="/cookies"` dans les footers de `cgu/page.tsx` et `confidentialite/page.tsx`, alors que la route réelle est `/politique-cookies` (confirmé : aucun fichier `app/cookies/`, aucune redirection dans `next.config.ts`) | Non corrigé, signalé | Bug de **navigation** (lien cassé), explicitement hors périmètre de ce chantier éditorial texte-only — voir Observations hors périmètre |
| "Directeur de la publication : Aboubakar Balder" | Apparaît identiquement dans `cgu/page.tsx` et `mentions-legales-client.tsx` — possible coquille sur le nom de famille (le reste du projet utilise "Balde224"/Bryan Baldé) | Non corrigé | Donnée factuelle (nom légal réel) — "zéro donnée inventée" : je ne peux pas confirmer l'orthographe correcte sans que Bryan la valide lui-même. Signalé en validation, pas corrigé unilatéralement. |
| `app/offres/conditions/conditions-offres-client.tsx` | Rédaction volontairement conditionnelle ("peut", jamais "recommande automatiquement") documentée en commentaire de code comme vérifiée en base avant écriture ; section 15 honnêtement laissée en placeholder `[Clause à finaliser par le conseil juridique...]` plutôt qu'inventée | Conservé | Exemplaire — même niveau d'honnêteté que le reste du chantier, appliqué à un texte contractuel |
| Reste du contenu (CGU, Confidentialité, Mentions légales, Politique de cookies, Conditions prestataires) | Aucune faute d'orthographe ou de grammaire relevée sur un survol structurel des ~2900 lignes cumulées | Conservé | — |

### Comparaison au standard international (Étape 6)
Niveau standard pour des CGU/CGV SaaS (Stripe, Notion) : structure en articles numérotés, sommaire, encadrés d'engagement clé ("ne vend jamais vos données"). `conditions-offres-client.tsx` en particulier atteint un niveau de rigueur rare (honnêteté sur les mécanismes non construits, clause légale explicitement en attente plutôt qu'improvisée).

### Points nécessitant une validation
1. Orthographe exacte de "Aboubakar Balder" (nom légal, apparaît 2×).
2. Lien cassé `/cookies` → `/politique-cookies` (2 occurrences) — correction technique triviale mais hors périmètre texte, à traiter par Bryan ou dans un chantier séparé.

### Observations hors périmètre
- Lien de navigation cassé (`/cookies`) — fonctionnalité, pas texte.
- `app/conditions-prestataires/page.tsx` est un contrat B2B ciblant les institutions/prestataires, pas les citoyens — reste techniquement accessible depuis l'app citoyenne mais son contenu (éligibilité, obligations de prestataire, motifs de refus) est hors du public visé par ce chantier "côté Citoyen" ; revu superficiellement par souci de complétude, non réécrit.

### Implémentation
Aucun changement de texte appliqué sur les 6 fichiers — conformément au protocole "zéro donnée inventée", toute correction potentielle (nom, lien) est documentée pour validation par Bryan plutôt qu'exécutée unilatéralement. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 19.1 — FAQ (`app/faq/page.tsx`)

### Contexte
Centre d'aide public (Général/Citoyens/Technique/Diaspora), recherche locale, sheet de réponse avec vote utile/pas utile. Fichier visuellement et stylistiquement distinct du reste du produit (dégradé jaune fixe sans support du mode sombre, police Sora, forte densité d'emoji dans les réponses) — semble antérieur à la discipline visuelle établie par les chantiers plus récents documentés dans CLAUDE.md.

### Inventaire, évaluation et décisions
| Élément | Constat | Décision | Justification |
|---|---|---|---|
| Lien "Politique de confidentialité" (FAQ c5) | `href: "#"` — lien factice, ne mène nulle part | Signalé, non corrigé | Bug de navigation (lien mort), hors périmètre texte de ce chantier — même traitement que le lien `/cookies` cassé sur les pages légales (Écran 18) |
| Email support | `yelen224gn@gmail.com` (FAQ g4, tech2, tech3) vs `contact@yelen224.com` utilisé partout ailleurs dans le produit (CGU, mentions légales, Politique de cookies) | Signalé, non corrigé | Incohérence factuelle entre deux adresses de contact réelles potentiellement valides toutes les deux (boîte de secours ?) — je ne peux pas savoir laquelle est active sans confirmation de Bryan, donc pas de correction unilatérale (zéro donnée inventée) |
| "Aboubakar Balder" (FAQ g5) | Même nom que sur CGU/Mentions légales (3e occurrence identique) | Signalé, non corrigé | Cohérent avec les 2 autres occurrences — renforce l'hypothèse que c'est la graphie voulue, mais reste à confirmer par Bryan |
| Densité d'emoji dans les réponses | Quasi chaque ligne de réponse commence par un emoji (📱🔐🎯✅ etc.), contraste fort avec le reste du produit (emoji réservés aux badges/notifications ponctuelles) | Non modifié | Réécrire l'intégralité des ~20 réponses représente une refonte stylistique de fond, disproportionnée à corriger unilatéralement — signalé comme observation, pas comme "à corriger" au sens strict (le contenu reste compréhensible et n'est pas fautif) |
| "54 pays de la diaspora guinéenne d'ici fin 2025" (FAQ g3) | Objectif chiffré daté, formulé comme un fait en cours plutôt qu'un objectif futur explicite | Conservé | Contrairement aux statistiques utilisateurs retirées lors du chantier onboarding (confirmées fausses par Bryan), ceci est présenté comme un objectif ("d'ici fin 2025"), pas un fait actuel — distinction déjà établie dans ce chantier entre "chiffre confirmé faux" et "langage prudent d'objectif" |
| Reste du contenu (structure des réponses, mécanique de recherche, sheet de vote) | Clair, fonctionnel, ton direct | Conservé | — |

### Comparaison au standard international (Étape 6)
Le mécanisme (recherche, catégories, sheet de réponse, vote utile) est au niveau attendu d'un centre d'aide Intercom/Zendesk. Le style visuel et la densité d'emoji restent en retrait par rapport au reste du produit — écart à traiter dans un futur chantier design plutôt que dans celui-ci.

### Points nécessitant une validation
1. Lien mort `href="#"` (réponse c5) → devrait pointer vers `/confidentialite`.
2. Quelle adresse email de support est la bonne : `yelen224gn@gmail.com` ou `contact@yelen224.com` ?
3. Orthographe de "Aboubakar Balder" (3e occurrence, voir Écran 18).

### Observations hors périmètre
Absence de support du mode sombre sur cet écran (fond dégradé jaune fixe) — design, hors périmètre texte.

### Implémentation
Aucun changement de texte appliqué — 3 points factuels/techniques identifiés nécessitent une décision de Bryan avant toute correction. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 19.2 — Contact (`app/contact/page.tsx`)

### Contexte
Formulaire de contact multi-type (Général/Institution/Presse/Support), même style visuel que FAQ (Sora, dégradé jaune, sans mode sombre). Soumission réelle via `formsubmit.co` vers `yelen224gn@gmail.com`.

### Inventaire, évaluation et décisions
| Élément | Constat | Décision | Justification |
|---|---|---|---|
| Email de contact | `yelen224gn@gmail.com` utilisé comme cible réelle de soumission du formulaire (`fetch` vers `formsubmit.co/ajax/yelen224gn@gmail.com`) et affiché en "Email direct" | Conservé | Confirme que cette adresse est fonctionnellement active — renforce (sans le résoudre) le doute déjà signalé sur l'Écran 19.1 (FAQ) : `contact@yelen224.com` utilisé dans les pages légales pourrait être l'adresse obsolète plutôt que l'inverse. Toujours signalé pour validation, pas corrigé unilatéralement (aucune des deux adresses n'est vérifiable comme "la bonne" sans confirmation de Bryan). |
| Formulaire | Labels clairs par type de demande, champs conditionnels pertinents (institution/presse/support) | Conservé | Bien structuré |
| Confirmation d'envoi | "Message envoyé !" / "Notre équipe vous répond sous 24–48h ouvrées." | Conservé | Clair |
| Erreur d'envoi | "Erreur. Réessayez ou écrivez à yelen224gn@gmail.com" | Conservé | Cohérent avec l'email de soumission réel de ce formulaire |
| Note de confidentialité | "Données protégées · jamais partagées avec des tiers." | Conservé | Cohérent avec l'engagement affiché ailleurs (CGU Article 7) |

### Comparaison au standard international (Étape 6)
Formulaire de contact au niveau attendu (types de demande, champs contextuels, honeypot anti-spam). Même remarque stylistique que FAQ (emoji, absence de mode sombre) — écart design hors périmètre.

### Points nécessitant une validation
Confirmation de l'adresse email de support réellement active (`yelen224gn@gmail.com`, utilisée ici et en FAQ, vs `contact@yelen224.com` des pages légales) — voir Écran 19.1.

### Observations hors périmètre
Absence de support du mode sombre — design, hors périmètre.

### Implémentation
Aucun changement de texte appliqué. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 19.3 — Carte, Accès mobile requis, Région non disponible, Récupération de compte

### Contexte
4 écrans courts regroupés : `app/carte/page.tsx` (route orpheline, supplantée par la vue carte intégrée à `/recherche`, conservée fonctionnelle), `app/acces-mobile-requis/page.tsx` et `app/region-non-disponible/page.tsx` (murs d'accès miroirs, jamais de détail technique exposé sur la vraie raison du blocage — décision CEO documentée), `app/recuperation-compte/recuperation-client.tsx` (formulaire de récupération de compte, un des 4 écrans POC i18n listés dans CLAUDE.md).

### Inventaire, évaluation et décisions
| Écran | Éléments clés | Décision | Justification |
|---|---|---|---|
| Carte | "Appeler" / "Itinéraire" | Conservé | Minimal et clair |
| Accès mobile requis | "Yelen224 est fait pour votre téléphone." / "L'espace citoyen n'est accessible que depuis un mobile ou une tablette." / "Ouvrez ce lien depuis votre téléphone pour continuer." | Conservé | Clair, honnête, propose une alternative pertinente (espace professionnel) pour les institutions qui atterriraient ici par erreur |
| Région non disponible | "Yelen n'est pas encore disponible dans votre région." / "Nous préparons actuellement le déploiement de Yelen." / "Vérifier ma région" | Conservé | Ne révèle jamais la vraie mécanique (géoblocage edge) — cohérent avec la décision CEO documentée dans le code |
| Récupération de compte | Texte entièrement piloté par `useTranslations("authentication.recovery")` (aucun texte en dur dans le composant) | Non audité (texte externe) | Un des 4 écrans POC i18n explicitement listés dans CLAUDE.md (`/chantiers i18n Phase 1`) — le contenu réel vit dans `messages/*.json`, hors du périmètre direct de ce composant ; auditer ces clés reviendrait à sortir du périmètre "screens" pour entrer dans le système i18n lui-même, déjà acté comme hors scope par CLAUDE.md pour ce chantier |

### Comparaison au standard international (Étape 6)
Les 3 écrans non-i18n sont au niveau attendu pour des murs d'accès/états de blocage (honnêteté sur ce qui est révélé, jamais de détail technique). Aucun texte ne nécessite de retouche.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Contenu textuel de `recuperation-client.tsx` externalisé dans les fichiers de traduction — non audité ici (cohérent avec le traitement déjà appliqué à `/compte/langue` en Écran 16).

### Implémentation
Aucun changement de texte appliqué sur les 3 écrans en dur. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 19.4 — Ambassades et Consulats (`app/ambassades/page.tsx`)

### Contexte
Annuaire des 27 représentations diplomatiques guinéennes (téléphone/email réels par pays), filtres par continent, recherche, fiche détail expandable. Écran distinct visuellement (thème rouge/doré façon site vitrine plutôt que l'app mobile habituelle) — auto-hébergé (Lot 1.5, référence citée par plusieurs autres écrans de ce groupe).

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Nouveau texte | Justification |
|---|---|---|---|---|
| CTA "Votre pays n'est pas encore listé ?" | "Contacter le ministère →" | Corrigé | "Contacter Yelen →" | Le lien pointe réellement vers `/contact` (formulaire de support Yelen), jamais vers un ministère guinéen — le libellé laissait croire à un contact institutionnel direct, ce qui est faux et va au-delà du positionnement de marque "officielle" déjà validé par Bryan (qui ne prétend jamais que Yelen EST ou relaie directement un ministère) |
| Hero | "Réseau diplomatique officiel" / "Accédez aux services diplomatiques de la République de Guinée depuis {n} représentations à travers le monde." | Conservé | — | Décrit un annuaire réel de contacts d'ambassades existantes, cohérent avec le positionnement "officielle" déjà tranché par Bryan |
| Stat "24/7 · RDV en ligne" | — | Conservé | — | Décrit une capacité technique réelle (prise de RDV en ligne disponible en permanence), pas un chiffre d'utilisateurs |
| Services consulaires | "Passeport guinéen", "Visa d'entrée", "Actes d'état civil", etc. + délais indicatifs | Conservé | — | Descriptions factuelles de services consulaires standards |
| "Comment ça marche" | 3 étapes claires | Conservé | — | Direct |
| État vide recherche | "{n} représentation(s) trouvée(s)" | Conservé | — | Pluriel correct |

### Comparaison au standard international (Étape 6)
Niveau annuaire consulaire officiel (type site d'ambassade type gouvernemental) : après correction, aucune formulation ne prête à confusion sur qui reçoit réellement un message envoyé depuis cet écran.

### Points nécessitant une validation
Aucun — correction non ambiguë (le lien technique et le libellé étaient objectivement en contradiction).

### Observations hors périmètre
Aucune.

### Implémentation
1 correction appliquée ("Contacter le ministère" → "Contacter Yelen", alignement du libellé sur la destination réelle du lien). Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 19.5 — Éducation / "Et si..." (`app/education/page.tsx`)

### Contexte
20 cartes motivationnelles en popup (Prédictions jeunesse / Organisation / Réussir sans partir / Citoyen YELEN), regroupées en 4 sections + 5 vidéos YouTube. Contrairement au reste du produit (`menu/calculatrice`, `menu/lecons-argent`), aucune des affirmations chiffrées n'était sourcée à l'origine.

### Constat majeur (signalé à Bryan avant correction)
Sur 17 occurrences du bloc `stats` (cartes à 3 chiffres), la quasi-totalité présentait des statistiques inventées comme des faits établis, sans aucune source — le même problème que "des milliers de Guinéens"/"+10 000 utilisateurs" déjà retiré de l'onboarding, mais ici sur ~15 cartes distinctes. Deux occurrences concernaient directement Yelen lui-même : "Les institutions qui utilisent YELEN réduisent les attentes de 80%" et "Plus de 3h de file perdue chaque semaine en Guinée par personne active" (carte 8) — des affirmations d'impact produit non vérifiées, jamais mesurées en base. Une carte (20, "Devenir prescripteur") décrivait en plus un mécanisme de parrainage ("débloques des avantages prioritaires") alors que le parrainage est un stub non construit (voir CLAUDE.md, `CitoyenMenu.tsx` "Parrainage stub").

Question posée à Bryan : retirer les chiffres non sourcés, laisser tel quel, ou lister d'abord. **Réponse : retirer les chiffres non sourcés** (option recommandée).

### Corrections appliquées (11 cartes sur 20)
| Carte | Chiffre/affirmation retiré | Remplacement |
|---|---|---|
| 1 — Coder | "60% des emplois", "3× le salaire moyen", bloc stats entier | Reformulé sans chiffre, bloc stats supprimé |
| 2 — Entreprise | "13M d'habitants" (précision non sourcée), "+200% Startups 2024", bloc stats entier | "plusieurs millions d'habitants", stats supprimé |
| 3 — Épargner dès 20 ans | "×5 Valeur en 20 ans" (bloc stats) | Bloc stats supprimé (contenu narratif conservé, l'exemple 50 000 GNF/mois reste un exemple illustratif explicite, pas une affirmation de marché) |
| 5 — Coopérative | "30% des ressources en eau douce", "gagne plus qu'un fonctionnaire" (comparaison invérifiable), bloc stats | Reformulé sans chiffre ni comparaison, stats supprimé |
| 6 — Mentor | "multiplie ton impact par 10", "vaut plus que n'importe quel diplôme étranger" (comparaison invérifiable), bloc stats | Reformulé, stats supprimé |
| 8 — Zéro file d'attente | **"réduisent les attentes de 80%"**, **"3h de file perdue/semaine en Guinée"** (affirmations sur Yelen et sur la Guinée, non sourcées), bloc stats | Reformulé autour de la mécanique réelle (réservation à l'avance), stats supprimé |
| 11 — Freelance | "500$/mois" (chiffre de revenu précis non sourcé), bloc stats | Reformulé sans chiffre, stats supprimé |
| 12 — Agri-tech | "×3 rendements", "sous-approvisionnés" (affirmation de marché invérifiable), bloc stats | Reformulé, stats supprimé |
| 13 — Réseau | "10× plus d'opportunités" | Reformulé sans multiplicateur |
| 16 — Impact citoyen | "1h Gagnée/visite" (affirmation d'impact Yelen non mesurée), bloc stats | Reformulé, stats supprimé |
| 17 — Effet boule de neige | "inspires 5 personnes", bloc stats | Reformulé sans chiffre, stats supprimé |
| 20 — Prescripteur | "Parraine 5 amis... débloques des avantages prioritaires" (décrit un mécanisme de parrainage non construit) | Reformulé en incitation générale sans promettre de mécanisme de récompense |

### Cartes conservées sans modification
Cartes 4 (3 langues — comptage descriptif, pas une statistique de marché), 7/9/10 (méthodes établies — 5S, matrice d'Eisenhower, routine — aucun chiffre de marché), 14 (1h/jour × 365 jours = 365h — arithmétique, pas une statistique externe), 15/18/19 (description de fonctionnalités réelles ou labels qualitatifs non chiffrés).

### Points nécessitant une validation
"YELEN en ambassade" (carte 19) affirme que "les ambassades guinéennes utilisent aussi YELEN" — affirmation fonctionnelle (pas un chiffre) que je ne peux ni confirmer ni infirmer sans accès à la base des institutions réelles ; non modifiée dans cette passe car hors du périmètre précis de la décision ("chiffres non sourcés"), mais à vérifier par Bryan si des ambassades sont réellement onboardées comme institutions actives sur la plateforme aujourd'hui.

### Comparaison au standard international (Étape 6)
Après correction, le ton reste motivationnel et engageant (registre volontairement différent du reste du produit — contenu éditorial/inspirationnel plutôt que fonctionnel) mais sans plus aucune statistique fabriquée, alignant enfin cet écran sur la discipline "zéro donnée inventée" déjà appliquée ailleurs (Leçons d'argent, Calculatrice, Vos tendances).

### Implémentation
11 cartes réécrites (suppression de tous les chiffres/multiplicateurs non sourcés, y compris 2 affirmations directes sur l'impact de Yelen et 1 mécanisme de parrainage non construit). Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 19.6 — Guide prestataire (`app/guide-prestataire/page.tsx`)

### Contexte
Documentation à destination des institutions/prestataires (10 chapitres : inscription, profil, disponibilités, RDV, statistiques, badge vérifié, QR code, support...). Audience institutionnelle, pas citoyenne — techniquement en marge du périmètre "côté Citoyen" de ce chantier (comme `conditions-prestataires`, Écran 18), revu ici par souci de complétude puisque listé dans le périmètre étendu.

### Corrections appliquées
| Élément | Avant | Après | Justification |
|---|---|---|---|
| Titre chapitre 09 + 3 occurrences body | "QR Code" (×4 : titre chapitre, résumé, caractéristiques, chemin UI "Mon QR Code") | "QR code" | Bug systémique de casse déjà corrigé partout ailleurs dans le produit — s'applique indépendamment de l'audience (citoyenne ou institutionnelle) |

### Constat non corrigé (audience institutionnelle, hors décision prise pour Écran 19.5)
Ce fichier contient le même type d'affirmations chiffrées non sourcées que celles retirées de `app/education/page.tsx` sur demande de Bryan, mais concernant cette fois les prestataires : "Les institutions avec un profil à 100% reçoivent en moyenne 3× plus de demandes de RDV" et "+65% de vues profil / +80% de taux de conversion vers les RDV" (impact du badge vérifié). N'ayant pas reçu de décision explicite pour ce fichier à audience institutionnelle (distincte de la décision prise pour l'écran citoyen Éducation), ces chiffres n'ont pas été retirés — signalés pour décision de Bryan plutôt que corrigés par extrapolation de sa décision précédente.

### Points nécessitant une validation
1. Confirmer si les statistiques "3× plus de demandes", "+65% de vues", "+80% de conversion" sont des chiffres réels mesurés par Yelen ou doivent être retirées comme sur l'écran Éducation.
2. Ce fichier étant à audience institutionnelle, confirmer s'il doit être traité dans un futur chantier éditorial séparé (institution/admin) plutôt qu'ici.

### Observations hors périmètre
Contenu globalement institutionnel (audience prestataires), en marge du périmètre "côté Citoyen" déclaré pour ce chantier.

### Implémentation
1 correction de casse appliquée (4 occurrences "QR Code"→"QR code"). Statistiques non sourcées signalées, non retirées (décision en attente). Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 19.7 — Avis (legacy, `app/avis/page.tsx`)

### Contexte
Écran legacy orphelin (aucun lien nulle part dans le produit, confirmé par grep lors de l'audit de consolidation antérieur) : formulaire de dépôt d'avis par `?rdv_id=`, remplacé fonctionnellement par le flux "Mes avis" actuel. CLAUDE.md documente déjà une **décision en attente de Bryan** : supprimer cet écran plutôt que le garder en doublon (`/backlog-produit`).

### Constat
Accents manquants sur plusieurs chaînes en dur : "Tres mauvais" (→ Très mauvais), "apres" (→ après), "rendez-vous termine" (→ rendez-vous terminé), "deja laisse un avis" (→ déjà laissé un avis). Confirme le caractère daté de cet écran par rapport au reste du produit.

### Décision
Aucune correction appliquée. Puisque le sort de cet écran (conservation vs suppression) est une décision produit déjà identifiée et non tranchée par Bryan, réécrire son texte reviendrait à investir du temps sur un écran potentiellement supprimé la semaine prochaine — signalé pour que la correction des accents soit faite seulement si Bryan décide de le garder, sinon sans objet.

### Points nécessitant une validation
Décision déjà en attente (voir CLAUDE.md `/backlog-produit`) : supprimer `app/avis/page.tsx` ou le conserver. Si conservé, les accents manquants relevés ci-dessus devront être corrigés.

### Implémentation
Aucun changement appliqué — décision produit préalable requise. Non vérifié dans un navigateur.

## Écran 19.8 — Centre de signalement (`app/signalement/page.tsx`)

### Contexte
Formulaire de signalement citoyen (institution + RDV concerné, motif, description ≥20 caractères, preuve photo optionnelle) + historique des signalements envoyés, source unique `lib/signalementsConstants.ts` (chantier case management, voir CLAUDE.md `/modules-livres`).

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Bannière d'avertissement | "Un signalement est examiné par l'équipe Yelen et peut entraîner une décision sur le compte de l'institution concernée […] un signalement infondé ou abusif expose son auteur aux mêmes conséquences sur son propre compte." | Conservé | Avertissement clair et symétrique (dissuade les signalements abusifs sans décourager les signalements légitimes) |
| État vide RDV éligibles | "Vous n'avez aucun rendez-vous déjà passé avec cette institution. Un signalement doit documenter un fait précis survenu lors d'un rendez-vous — impossible d'en envoyer un sans rendez-vous concerné." | Conservé | Explique la règle métier sans frustration |
| Compteur caractères | "{n} caractères ({20-n} manquants)" | Conservé | Clair |
| Succès | "Signalement envoyé !" / "Notre équipe va examiner votre signalement sous 48h ouvrées." | Conservé | Délai annoncé cohérent avec le reste du produit |
| État vide historique | "Aucun signalement envoyé" / "Vos signalements apparaîtront ici" | Conservé | Neutre, pas de ton négatif |
| Mention légale | "En soumettant ce signalement, vous acceptez nos CGU et confirmez l'exactitude des informations fournies." | Conservé | Standard |

### Comparaison au standard international (Étape 6)
Niveau Trust & Safety Airbnb/Uber pour un formulaire de signalement : friction proportionnée (RDV obligatoire, description minimale), avertissement symétrique sur les signalements abusifs. Aucun texte ne nécessite de retouche.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
Aucun changement de texte nécessaire. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 19.9 — Détail d'une offre (`app/offres/[id]/page.tsx`)

### Contexte
Page publique de détail d'une offre partenaire (Server Component, metadata Open Graph dynamique), affichant faits/avantages/limites, description, expiration, et CTA de redirection externe avec disclosure claire.

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Offre introuvable | "Cette offre n'est plus disponible" / "Elle a peut-être expiré ou été retirée par l'institution." | Conservé | Honnête, ne prétend pas connaître la cause exacte |
| Disclosure redirection | "Offre vérifiée par Yelen avant publication. En continuant, vous quittez Yelen pour le site de {partenaire}." | Conservé | Cohérent avec `conditions-offres-client.tsx` (Écran 18) : jamais présentée comme un achat direct sur Yelen |
| Expiration | "Offre valable jusqu'au {date}." | Conservé | Clair |
| CTA | `cta_label` dynamique ou repli "Accéder à l'offre" | Conservé | Repli honnête si le partenaire n'a pas fourni de libellé |
| Sections | "Avantages" / "Limites" / "Description de l'offre" | Conservé | Structure claire, présente aussi les limites (pas seulement les avantages) |

### Comparaison au standard international (Étape 6)
Niveau Honey/RetailMeNot pour une fiche d'offre affiliée : disclosure de redirection explicite et systématique, cohérente avec le document contractuel associé. Aucun texte ne nécessite de retouche.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
Aucun changement de texte nécessaire. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

---

**Écran 19 (Écrans support/info) — clos.** 9 groupes de fichiers audités (FAQ, Contact, Carte/Accès mobile/Région non disponible/Récupération compte, Ambassades, Éducation, Guide prestataire, Avis legacy, Signalement, Offre détail). Bilan : 1 correction factuelle réelle (lien "Contacter le ministère" trompeur → "Contacter Yelen"), 1 chantier de fond mené à la demande explicite de Bryan (retrait de statistiques fabriquées sur 11 cartes de l'écran Éducation, dont 2 concernant directement l'impact de Yelen), 1 correction de casse "QR Code"→"QR code" (guide prestataire), plusieurs points factuels signalés pour validation sans correction unilatérale (nom "Aboubakar Balder", email de support à deux adresses concurrentes, écran Avis legacy en attente de décision de suppression déjà actée dans CLAUDE.md).

---

# CHANTIER CLOS — Bilan global

Les 19 écrans/groupes d'écrans du périmètre "côté Citoyen" de Yelen224 ont été audités selon la méthodologie Observer → Inventorier → Évaluer → Réécrire si nécessaire → Implémenter → Vérifier → Documenter. Environ 90 routes/fichiers couverts au total (dont plusieurs fichiers de 1000-1700 lignes).

**Corrections de fond appliquées** :
- ~25 corrections de casse "QR Code" → "QR code" (bug systémique touchant app/page.tsx, mon-qr, activités, carte-yelen, confidentialité, guide prestataire, CompteRechercheOverlay).
- ~10 états de chargement de bouton harmonisés sur la convention verbe + ellipse ("Envoi…", "Enregistrement…", "Suppression…", "Déconnexion…").
- Retrait de statistiques fabriquées sur l'onboarding (chiffres d'utilisateurs) et sur l'écran Éducation (11 cartes, dont 2 affirmations directes sur l'impact de Yelen) — sur demande explicite de Bryan à chaque fois.
- Corrections d'incohérences terminologiques ponctuelles (Vos tendances : "adresse"→"établissement"), de liens trompeurs (Ambassades : "Contacter le ministère"→"Contacter Yelen"), de doublons de libellés (CompteRechercheOverlay, Offres).
- Alignement de vocabulaire cross-écrans (RDV, "Rechercher un établissement", "Télécharger mes données").

**Constat global** : le produit s'est révélé, dans sa grande majorité, déjà d'un niveau éditorial élevé — particulièrement les chantiers récents (Mes démarches, Yelen Rewards, Mes dépenses, Vérification d'identité) qui appliquent systématiquement une discipline d'honnêteté forte (zéro donnée inventée, zéro promesse non tenue, sources citées). Les rares écarts trouvés se concentrent sur des écrans plus anciens (FAQ, Contact, Éducation — style visuel et éditorial différent, absence de mode sombre) et sur les pages légales (dont le contenu factuel/contractuel reste hors périmètre d'une réécriture éditoriale).

**Points laissés en attente de décision Bryan** (consolidés) :
1. Orthographe de "Aboubakar Balder" (CGU, Mentions légales, FAQ — 3 occurrences identiques).
2. Adresse email de support active : `contact@yelen224.com` (pages légales) vs `yelen224gn@gmail.com` (FAQ, Contact — confirmée fonctionnelle par le formulaire réel).
3. Lien cassé `/cookies` → `/politique-cookies` (CGU, Confidentialité).
4. Statistiques non sourcées sur `guide-prestataire` ("3× plus de demandes", "+65%/+80%" impact badge) — même traitement que Éducation ou non ?
5. Sort de l'écran `app/avis/page.tsx` (legacy, déjà en attente dans CLAUDE.md).
6. Affirmation "les ambassades guinéennes utilisent aussi YELEN" (Éducation, carte 19) — à vérifier en base.

Registre complet : `docs/product/YELEN_EDITORIAL_CITOYEN.md`.
