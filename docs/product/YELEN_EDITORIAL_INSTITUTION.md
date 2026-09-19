# CHANTIER — HUMANISATION ÉDITORIALE DE YELEN, CÔTÉ INSTITUTION

Suite directe du chantier éditorial côté Citoyen (voir
`docs/product/YELEN_EDITORIAL_CITOYEN.md`, clos), même méthodologie et
mêmes critères, appliqués cette fois au dashboard institution
(`app/[slug]/[id]/components/*.tsx`, ~47 fichiers).

**Mode : continu, de bout en bout** (décision Bryan dès le lancement de ce
chantier, contrairement au citoyen où le mode continu n'a été activé
qu'en cours de route) — pas de pause de validation entre écrans, mais
toute décision engageante (donnée factuelle non vérifiable, changement de
substance métier) reste signalée pour validation plutôt que tranchée
unilatéralement.

**Périmètre : dashboard institution uniquement** — écrans publics
institution (connexion, inscription, portail employé `/clock/[slug]`)
explicitement hors périmètre de ce chantier (à traiter séparément si
besoin).

## Méthodologie (rappel, identique au chantier Citoyen)
Observer → Inventorier tout le texte visible (titres, sous-titres,
boutons, labels, placeholders, erreurs, confirmations, états vides) →
Évaluer (français naturel, clarté, précision, ton humain, cohérence de
marque, pas de phrasé mécanique, pas de répétition inutile,
compréhension immédiate, cohérence inter-écrans) → Réécrire seulement si
nécessaire (garder ce qui est déjà bon) → Implémenter → Vérifier
(comparer au standard Google/Meta/Apple/Shopify) → Documenter.

## Contexte technique important
Un chantier de fond distinct et déjà en cours (harmonisation des boutons/
cartes vers `components/ui/Button.tsx` et `components/ui/Card.tsx`,
uncommitted, ~42 fichiers déjà modifiés au lancement de ce chantier
éditorial) touche exactement les mêmes fichiers. Aucun conflit de fond :
ce chantier ne touche que le texte, jamais les composants/styles/
structure. Toujours relire l'état réel du fichier sur disque avant
modification (les diffs uncommitted du chantier boutons sont déjà présents).

## Suivi global

| # | Écran/fichier | Statut |
|---|---|---|

## Écran 1 — Profil (`ProfilTab.tsx`)

### Contexte
Écran personnel (PIN, identité), accessible à tous les rôles — distinct de "Paramètres" (institutionnel, admin uniquement).

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Titre | "Profil" | Conservé | Clair |
| Sous-titre | "Vos informations personnelles de connexion." | Conservé | Précis |
| Bouton | "Changer mon PIN" / "Nouveau PIN à 6 chiffres" / "Annuler" / "Valider" | Conservé | Direct |
| Toasts | "Erreur lors du changement de PIN" / "PIN mis à jour" | Conservé | Clair |

### Comparaison au standard international (Étape 6)
Niveau attendu pour un écran de profil minimal. Aucun texte ne nécessite de retouche.

### Implémentation
Aucun changement de texte nécessaire. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 2 — Profil Entreprise (`ProfilEntrepriseTab.tsx`, 866 lignes)

### Contexte
Identité publique de l'institution (bannière/logo, informations générales, langues, contact/localisation, horaires publics distincts des disponibilités RDV) + section "Identité internationale" (institutions étrangères, vérifiée par Yelen Trust) + sélecteur catégorie/activité/statut juridique en 3 étapes (TaxoModal).

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Nouveau texte | Justification |
|---|---|---|---|---|
| Titre section | "Contact & Localisation" | Corrigé | "Contact et localisation" | Règle déjà établie côté citoyen : "&" acceptable uniquement en contexte compact (badge/chip), jamais dans un vrai titre de section — un vrai titre de section ("Identité visuelle", "Informations générales" etc. juste au-dessus) doit suivre la même convention |
| Titre écran | "Profil Entreprise" | Conservé | — | Clair |
| Sous-titre | "Identité publique de votre institution — visible par les citoyens sur Yelen224." | Conservé | — | Précis |
| Alerte statut manquant | "Statut juridique et activité manquants" / "Requis pour soumettre vos documents de vérification Yelen224." / "Compléter maintenant" | Conservé | — | Actionnable |
| Renvoi Services | "La liste de ce que vous proposez à vos clients se gère maintenant depuis l'onglet Services (section "Offre gratuite")." | Conservé | — | Vérifié cohérent avec le libellé réel utilisé dans `ServicesTab.tsx` ("Offre gratuite"), malgré un commentaire de code obsolète qui parle d'"Offre générale" — seul le texte affiché compte |
| Bloc horaires | "Ces horaires déterminent le badge Ouvert / Fermé […] Ils sont distincts des créneaux de rendez-vous configurés dans l'onglet Disponibilités — les deux restent séparés pour le moment." | Conservé | — | Honnête sur une dette technique connue et documentée (deux mécanismes séparés, fusion non faite faute de temps) |
| Identité internationale | "Organisation basée à l'étranger" / "Cette identité sera vérifiée par l'équipe Yelen […] avant toute publication publique […] — aucune organisation étrangère n'est visible sur simple déclaration." | Conservé | — | Honnête, cohérent avec le vrai flux de vérification (Yelen Trust, pas d'auto-publication) |
| TaxoModal | "Statut juridique" / "Catégorie d'activité" / "Activité principale", "Étape {n} / 3", "Verrouillé — des documents ont déjà été soumis avec ce statut. Contactez le support Yelen224 pour le corriger." | Conservé | — | Clair, explique le verrou plutôt que de le laisser opaque |
| Boutons | "Sauvegarde…"/"Enregistrer"/"Modifier", "Enregistrement…" | Conservé | — | Cohérent avec la convention verbe + ellipse déjà établie côté citoyen |

### Comparaison au standard international (Étape 6)
Niveau Stripe/Notion pour un formulaire d'identité d'entreprise complexe (multi-sections, sous-formulaire conditionnel, sélecteur en étapes) : après correction, aucun texte ne pose plus problème.

### Points nécessitant une validation
Aucun.

### Implémentation
1 correction appliquée ("Contact & Localisation" → "Contact et localisation"). Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Balayage transversal — Règle "&" (titres réels vs contextes compacts)

Avant la revue fichier par fichier, un balayage `grep " & "` sur l'ensemble de `app/[slug]/[id]/components` et `app/[slug]/[id]/layout.tsx` a permis de traiter d'un coup la règle déjà établie côté citoyen : "&" acceptable uniquement en contexte compact (chip/badge étroit), jamais dans un vrai titre de page/section ou un libellé de navigation de taille normale.

### Corrections appliquées
| Fichier | Avant | Après | Contexte |
|---|---|---|---|
| `ConditionsInformationsTab.tsx` | "Conditions & Informations" (H1) | "Conditions et informations" | Titre de page |
| `DisponibilitesTab.tsx` | "Gérer chambres & prestations" (bouton) | "Gérer chambres et prestations" | CTA primaire |
| `ParametresTab.tsx` | "Annulations & reports" (ligne de préférences notifs) | "Annulations et reports" | Cohérence avec ses 3 voisines ("Confirmations de RDV", "Rappels avant RDV", "RDV terminés") qui n'utilisent pas "&" |
| `RdvPasseTab.tsx` | "Date & heure" (label champ détail RDV) | "Date et heure" | Cohérence avec les 8 autres labels du même tableau (aucun autre n'utilise "&") |
| `ServicesHotelTab.tsx` | "Chambres & Services" (H1) | "Chambres et services" | Titre de page — le sous-titre juste en dessous utilisait déjà "et" naturellement |
| `EquipeTab.tsx` | "Équipe &amp; Accès" (H1) | "Équipe et accès" | Titre de page |
| `layout.tsx` (nav sidebar) | "Avis & Réputation" | "Avis et réputation" | Libellé de navigation, taille normale (pas un badge) |
| `layout.tsx` (menu aide) | "Aide & ressources" | "Aide et ressources" | Item de menu popover, taille normale |
| `layout.tsx` (Paramètres → Abonnement) | "Abonnement & Forfait" | "Abonnement et forfait" | Item de liste 13px, même style que ses voisins sans "&" |
| `layout.tsx` (Paramètres → Support) | "Aide & FAQ" | "Aide et FAQ" | Idem |

### Occurrences examinées et conservées (contexte compact confirmé)
- `MesOffresTab.tsx` : "Télécom & Média", "Commerce & PME" — labels rendus via `ChipSelect` (composant chip), contexte compact légitime.
- `ServicesHotelTab.tsx` : "Bien-être & loisirs" — exemple dans un placeholder de champ libre (pas un libellé fixe de l'interface), moindre enjeu de cohérence de marque.
- `layout.tsx` : "Support & Légal" — eyebrow de section 10px tout en majuscules (style catégorie/tag), traitement visuel proche d'un badge plutôt que d'un vrai titre.

### Observation non résolue
`AvisReputationTab.tsx` : le libellé de navigation ("Avis et réputation", après correction) ne correspond à aucun des 3 titres H1 réellement affichés dans l'onglet lui-même ("Santé du compte" ×3, selon l'état). Écart déjà présent avant cette correction (ne concerne pas l'ampersand) — signalé pour information, non retouché car je ne connais pas l'intention exacte (le nav pourrait délibérément désigner un ensemble plus large que le seul écran "Santé du compte").

### Implémentation
10 corrections de texte appliquées (H1, boutons, labels de champ, items de navigation). Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 3 — Profil Responsable (`ProfilResponsableTab.tsx`)

### Contexte
Identité de la personne responsable de l'établissement, distincte du profil entreprise public.

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Titre | "Profil Responsable" | Conservé | Clair |
| Sous-titre | "Vos informations personnelles en tant que responsable de l'établissement — distinctes du profil public de l'entreprise." | Conservé | Précise bien la distinction avec Profil Entreprise |
| Champs | "Prénom" / "Nom" / "Rôle dans l'institution" / "Téléphone personnel" / "Email personnel" | Conservé | Clair, "personnel" bien distingué des coordonnées publiques de l'entreprise |
| Boutons | "Sauvegarde…" / "Modifier" / "Enregistrer" | Conservé | Cohérent |

### Comparaison au standard international (Étape 6)
Niveau attendu. Aucun texte ne nécessite de retouche.

### Implémentation
Aucun changement de texte nécessaire. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 4 — Configuration Hôtel (`ConfigurationHotelTab.tsx`)

### Contexte
Écran dédié secteur hôtellerie uniquement : équipements de l'établissement (checklist catégorisée à vocabulaire contrôlé, distincte des équipements par chambre gérés dans Services) + règles complémentaires en texte libre.

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Titre | "Configuration Hôtel" | Conservé | Clair |
| Sous-titre | "Visible publiquement sur votre fiche, section "Équipements". Un équipement non coché n'apparaît pas côté citoyen." | Conservé | Transparence utile sur l'effet réel d'une case cochée |
| Renvoi chambres | "Gérer vos chambres" / "Les chambres — et leurs propres équipements — se créent dans l'onglet Services, pas ici." | Conservé | Clarifie une séparation de modèle de données autrement piégeuse (établissement vs chambre) |
| Section équipements | "Équipements de l'établissement" | Conservé | Clair |
| Bouton | "Enregistrer" / "Modifier" | Conservé | Cohérent |
| Règles complémentaires | "Ce qu'une checklist ne peut pas dire : horaires de check-in/check-out, restrictions, conditions particulières" | Conservé | Explique bien pourquoi ce champ texte libre coexiste avec la checklist |

### Comparaison au standard international (Étape 6)
Niveau attendu pour une configuration sectorielle spécialisée. Aucun texte ne nécessite de retouche.

### Implémentation
Aucun changement de texte nécessaire. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 5 — FormField & LocationPicker (composants utilitaires partagés)

### Contexte
`FormField.tsx` : composant de champ texte standardisé (aucun texte statique propre, tout vient des props des appelants déjà revus). `LocationPicker.tsx` : sélecteur de position sur carte (glisser-déposer + clic + géolocalisation), utilisé par `ProfilEntrepriseTab.tsx`.

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| LocationPicker — position non définie | "Position non renseignée — repère placé sur le centre approximatif de votre ville" | Conservé | Honnête sur le caractère approximatif de la position par défaut |
| LocationPicker — bouton | "Utiliser ma position actuelle" / "Localisation…" | Conservé | Cohérent avec la convention verbe + ellipse |
| LocationPicker — aide | "Glissez le repère ou touchez la carte pour indiquer l'emplacement exact de votre établissement — c'est cette position qui sera affichée aux citoyens sur la carte Yelen." | Conservé | Clair sur l'effet réel (visible côté citoyen) |

### Note (hors périmètre éditorial)
CLAUDE.md `/backlog-produit` documente : "aucun écran ne permet à une institution de renseigner latitude/longitude" comme point ouvert. Ce composant `LocationPicker.tsx`, réellement câblé dans `ProfilEntrepriseTab.tsx` (`latitude`/`longitude`/`onChange={setPosition}`), semble résoudre ce point — probablement une note de mémoire simplement devenue obsolète depuis. Signalé pour information, hors périmètre de ce chantier éditorial (pas un problème de texte).

### Implémentation
Aucun changement de texte nécessaire sur les 2 fichiers. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 6 — Chambres et services (`ServicesHotelTab.tsx`, 787 lignes)

### Contexte
Écran "Services Hôtel V2" (secteur hôtellerie uniquement) : gestion des chambres (photo/vidéo/prix/équipements obligatoires) et prestations (type, unité de prix, horaires, localisation), + historique des réservations. Titre déjà corrigé lors du balayage transversal "&".

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Sous-titre | "Vos chambres (obligatoire) et les prestations facultatives que vous proposez — visible sur votre fiche publique." | Conservé | Clarifie l'obligation (chambre) vs facultatif (prestation) |
| Types de prestation | "Réservable" / "Commandable" / "Avec supplément" / "Horaires limités" + aperçu de ce que verra le client ("Le client verra un bouton « Réserver »." etc.) | Conservé | Excellent — prévisualise l'effet concret de chaque choix avant validation |
| Erreurs de formulaire | "Le nom de la chambre est obligatoire", "Entrez un prix par nuit valide en {devise}", "Au moins une photo est obligatoire", etc. | Conservé | Précises, spécifiques à chaque champ |
| États vides | "Aucune chambre configurée" / "Ajoutez vos chambres avec photo et prix pour qu'elles apparaissent sur votre fiche publique." / "Aucune prestation configurée" / "Room service, spa, transfert aéroport, blanchisserie… Ajoutez vos prestations…" / "Aucune réservation" | Conservé | Concrets, avec exemples pertinents pour le secteur hôtelier |
| Confirmation suppression | "Supprimer {chambre/cette prestation} définitivement ?" | Conservé (texte) | `window.confirm()` natif — même remarque hors périmètre que sur plusieurs écrans citoyens (Favoris, Mes avis, Sécurité) |
| Toasts | "Prestation mise à jour" / "Prestation créée avec succès" / "Chambre {suspendue/activée}" | Conservé | Clair |
| Onglets | "Chambres" / "Prestations" / "Réservations" (avec compteurs) | Conservé | Direct |

### Comparaison au standard international (Étape 6)
Niveau Airbnb Host/Booking.com Extranet pour un catalogue de chambres et prestations hôtelières : aperçus contextuels, validations précises par champ, états vides avec exemples sectoriels pertinents. Aucun texte ne nécessite de retouche au-delà du titre déjà corrigé.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
`window.confirm()` natif pour la suppression d'une chambre/prestation — hors périmètre texte.

### Implémentation
Aucun changement de texte supplémentaire (titre déjà corrigé lors du balayage "&"). Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 7 — Centre de configuration / parcours d'activation (`CentreConfigurationTab.tsx`, 719 lignes)

### Contexte
Écran post-inscription remplaçant "Accueil" tant que l'établissement n'est pas configuré : checklist par groupes (obligatoire/facultatif), timeline "Configuration → Vérification Yelen → Activation", synthèse finale, FAQ de 6 questions, rails contextuels. Discipline d'honnêteté remarquable, documentée en détail dans le code (zéro délai chiffré inventé, zéro sous-étape fictive, `profilComplet` dérivé des groupes bloquants réels et non d'un `pct===100` trompeur).

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Hero | "Bienvenue{, prénom} !" / "Votre espace Yelen est presque prêt." / "Prenez un moment pour vérifier les informations de {nom} et compléter les quelques étapes restantes." | Conservé | Personnalisation réelle uniquement (jamais un prénom halluciné, voir commentaire de code) |
| Carte "en attente" | "Merci pour votre confiance." + "Votre dossier est maintenant en cours de vérification par notre équipe. […] Pour le moment, aucune action n'est requise de votre part." + "Nous vous informerons dès que la vérification sera terminée." | Conservé | Ton chaleureux et rassurant sans survendre un délai (aucun chiffre inventé) |
| Descriptions des groupes | "Les informations principales qui présentent votre établissement.", "Les personnes autorisées à utiliser l'espace professionnel.", etc. | Conservé | Claires, une phrase par groupe |
| Statuts d'étape | "OBLIGATOIRE" / "FACULTATIF" / "TERMINÉ" / "À CORRIGER" / "COMPLÉMENT DEMANDÉ" / "EN EXAMEN" / "Réservé" / "LECTURE" | Conservé | Vocabulaire cohérent et suffisant pour comprendre l'état sans ambiguïté |
| Statut de préparation | "Toutes les étapes obligatoires sont terminées" / "{n} étape(s) obligatoire(s) restante(s)" | Conservé | Pluriels corrects |
| Vérification Yelen | "Informations reçues" / "Profil complété" / "Vérification Yelen" / "Activation" | Conservé | Timeline honnête, jamais de fausse granularité |
| Bloc échec | "Votre dossier n'a pas été validé par Yelen. Contactez le support pour comprendre les raisons et les corriger." / "Votre compte est actuellement suspendu. Contactez le support Yelen pour en connaître la raison." | Conservé | Direct, sans minimiser la situation |
| FAQ (6 questions) | Ex. "Le pourcentage de préparation doit-il atteindre 100 % pour être activé ?" → "Non. Certaines étapes, comme Équipe et accès, sont facultatives. […]" | Conservé | Chaque réponse vérifiée contre le comportement réel du produit (voir commentaire de code), zéro délai inventé |
| Erreur de chargement | "Impossible d'afficher votre parcours d'activation" / "Vos informations n'ont pas été perdues — réessayez dans un instant." | Conservé | Rassure explicitement sur la non-perte de données |
| Rail "Ce qui va se passer" | 3 étapes numérotées + "Atteindre 100% de configuration ne signifie pas que votre espace est activé — la vérification Yelen reste nécessaire." | Conservé | Anticipe une confusion plausible (100% ≠ activé) avant qu'elle n'arrive |

### Comparaison au standard international (Étape 6)
Niveau Stripe Connect/Mercury pour un parcours d'activation KYC progressif : granularité honnête, FAQ anticipative, jamais de surprise (brief CEO explicitement cité en commentaire : "l'utilisateur doit tout savoir, il ne doit jamais être surpris"). Aucun texte ne nécessite de retouche — l'un des écrans les mieux disciplinés de tout le produit à ce jour, citoyen et institution confondus.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Email de support institutionnel `support@yelen224.com` (distinct des deux adresses déjà relevées côté citoyen : `contact@yelen224.com` et `yelen224gn@gmail.com`) — potentiellement une troisième adresse réelle et légitime (équipe support institution différente du support citoyen), signalé pour information globale plutôt que comme anomalie de ce fichier précis.

### Implémentation
Aucun changement de texte nécessaire. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 8 — Paramètres : Sécurité, Notifications, Zone dangereuse (`ParametresTab.tsx`, 780 lignes)

### Contexte
`ParametresTab` : sécurité du compte (PIN, biométrie WebAuthn, 2FA TOTP, appareils mémorisés) + préférences de notifications (par catégorie, canaux app/email/SMS — email/SMS encore des stubs honnêtement indiqués). `ParametresDangerZone` : déconnexion + suppression de compte en 3 étapes (sondage → transparence → confirmation par saisie du nom exact).

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| PIN | "Configuré — déverrouillage rapide actif" / "Non configuré" / "Modifier" / "Définir" / "Supprimer" | Conservé | Clair |
| Biométrie | "{n} appareil(s) enregistré(s)" / "Ajouter cet appareil" / "Utilisé {délai}" / "Ajouté {délai}" / "Retirer" | Conservé | Pluriels corrects |
| 2FA | "Activée — code demandé à chaque connexion" / "Non activée · protège votre compte personnel" | Conservé | Précise bien que c'est le compte du membre connecté, pas de l'institution (cohérent avec le commentaire de code sur le mirroring par membre) |
| Notifications par canal | Colonnes "App"/"Email"/"SMS" avec Email/SMS désactivés (title "Bientôt disponible") + note "Email et SMS arrivent bientôt — pour l'instant, toutes les notifications sont envoyées dans l'application." | Conservé | Honnête sur l'état réel des canaux non construits |
| Alerte opérationnelle | "RDV dépassés — action requise" / "Alerte opérationnelle, toujours active" / "Toujours actif" | Conservé | Justifie pourquoi ce toggle est verrouillé (alerte critique, pas désactivable) |
| Suppression — sondage | "Avant de partir..." / "Aidez-nous à comprendre pourquoi — ça reste entre nous, ça nous aide à améliorer Yelen224." | Conservé | Ton humain, pas culpabilisant |
| Suppression — transparence | "Voici ce qui va se passer" + 4 points réels (accès coupé immédiatement, fiche invisible immédiatement, données supprimées dans 30 jours, annulation possible avant cette date) | Conservé | Timeline précise et honnête, réversibilité clairement expliquée |
| Suppression — confirmation | "Pour confirmer, tapez le nom exact de votre établissement : {nom}" / "Supprimer définitivement mon compte" | Conservé | Friction proportionnée à une action irréversible |
| Déconnexion appareils | "Déconnecter les autres appareils ?" / "{n} appareil(s) mémorisé(s) devront se reconnecter — celui-ci reste connecté." | Conservé | Clair sur ce qui reste connecté |

### Comparaison au standard international (Étape 6)
Niveau Stripe/GitHub pour un centre de sécurité + flux de suppression de compte : transparence totale sur les conséquences et les délais réels (30 jours, réversible), honnêteté sur les canaux de notification non construits. Aucun texte ne nécessite de retouche.

### Points nécessitant une validation
Aucun — `support@yelen224.com` confirmé cohérent avec les autres écrans institution déjà revus (`CentreConfigurationTab.tsx`).

### Implémentation
Aucun changement de texte supplémentaire (1 correction déjà appliquée lors du balayage "&" : "Annulations & reports" → "Annulations et reports"). Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

---

**Groupe 1 (Profil & Configuration) — clos.** 9 fichiers audités. Bilan : 10 corrections "&"→"et" (balayage transversal touchant aussi Groupes 2/3 par anticipation), 0 autre changement — dossier globalement d'un niveau éditorial très élevé, avec plusieurs écrans exemplaires (Centre de configuration, Paramètres) sur l'honnêteté et l'anticipation des questions.

## Écran 9 — Dialogue "Confirmation de présence indisponible" (`CheckInUnavailableDialog.tsx`)

### Contexte
Modal affichée quand une institution tente de confirmer la présence d'un citoyen avant l'ouverture réelle du créneau (10 min avant l'heure du RDV) — présente le blocage comme une règle normale plutôt qu'une erreur, compte à rebours basé sur l'heure serveur (jamais l'horloge locale seule), fermeture et relance automatiques dès que le créneau s'ouvre.

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Titre | "Confirmation de présence indisponible" | Conservé | Neutre, factuel — pas un message d'erreur alarmant |
| Explication | "La confirmation de présence sera disponible le jour de votre rendez-vous, à partir de 10 minutes avant l'heure prévue." | Conservé | Précis sur la règle |
| Disponibilité | "Aujourd'hui à {heure}" / "Demain à {heure}" / "{Jour} {date} {mois} à {heure}" + "Dans {n} jours" | Conservé | Jamais de compte à rebours en heures pour un RDV à plusieurs jours (règle explicite respectée) |
| Compte à rebours | "Moins d'une minute" / "Encore {m} min" / "Encore {h} h {m} min" | Conservé | Clair |
| Justification de la règle | "Cette règle contribue à protéger les rendez-vous, les paiements et l'historique de présence sur Yelen." | Conservé | Explique le "pourquoi", évite la frustration d'un blocage arbitraire |
| Bouton | "Compris" | Conservé | Direct |

### Comparaison au standard international (Étape 6)
Niveau attendu pour un état de blocage temporisé honnête (façon "réessayer dans X minutes" d'un service bancaire) : jamais présenté comme une erreur, toujours expliqué. Aucun texte ne nécessite de retouche.

### Implémentation
Aucun changement de texte nécessaire. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 10 — Centre de validation (`ValiderRdvTab.tsx`, 1166 lignes)

### Contexte
Refonte Enterprise "Front Desk / Check-in Center" : saisie de code à 6 chiffres avec recherche automatique, fiche de validation en 5 zones (alertes → citoyen → détails → paiement → vérification/historique → action), timeline de la journée, KPI exécutifs, historique enrichi. Discipline d'honnêteté forte, documentée en tête de fichier : zéro chiffre inventé (ex. "Code expiré" jamais simulé faute de colonne réelle ; "Temps moyen" explicitement étiqueté "cette session" plutôt que présenté comme une moyenne globale trompeuse).

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Titre/hero | "Centre de validation" / "Validez les rendez-vous, confirmez les paiements et enregistrez l'arrivée des citoyens en quelques secondes." | Conservé | Clair |
| Saisie code | "Entrer le code citoyen" / "Le citoyen retrouve ce code dans son application Yelen." / "{n}/6 chiffres" / "Recherche en cours…" | Conservé | Direct |
| Erreur code | "Code introuvable" + message spécifique du serveur | Conservé | — |
| Alerte "en avance" | "Le citoyen est en avance" / "Rendez-vous prévu à {heure}, dans environ {n} min. La validation ne sera possible qu'à partir de 10 minutes avant l'heure prévue." | Conservé | Explique la règle plutôt que de bloquer sans justification |
| Identités séparées (réservation pour un tiers) | "Bénéficiaire du rendez-vous" / "Citoyen Yelen vérifié" / "Tiers — identité non vérifiée" / "Réservé par" / "Compte Yelen vérifié" | Conservé | Distinction volontaire entre bénéficiaire (non vérifié) et titulaire du compte (vérifié) — évite toute confusion sur qui est réellement identifié |
| Double confirmation paiement | "Le citoyen déclare avoir remis {montant}" / "Le citoyen n'a pas encore déclaré remettre ce paiement depuis son écran." | Conservé | Précis sur l'état réel de la déclaration |
| Vérification | "Identité cohérente" / "Code valide" / "Rendez-vous du jour" / "Institution correcte" | Conservé | 4 contrôles déterministes, aucun jugement porté sur le citoyen (voir commentaire de code) |
| Historique Yelen | "Premier rendez-vous de ce citoyen avec votre institution." / "{n} rendez-vous" / "{n} honoré(s)" / "{n} absent(s)" / "Dernière visite : {date}" | Conservé | Pluriels corrects, contexte utile sans être un CRM complet |
| Confirmation de succès | "Paiement confirmé." / "Présence confirmée." (service gratuit) / "Citoyen marqué absent" / "Réservation annulée" | Conservé | Distingue bien paiement vs présence simple |
| Modales de motif | "Annuler la validation" (paiement reversé si déjà confirmé, expliqué) / "Annuler la réservation" / "Marquer comme absent" (avertissement que l'action est visible du citoyen) | Conservé | Chaque modale explique la conséquence réelle avant de demander confirmation |
| États vides | "Rien traité pour l'instant aujourd'hui — les validations, absences et annulations apparaîtront ici au fil de la journée." / "Aucune réservation traitée aujourd'hui" | Conservé | Explique le mécanisme plutôt qu'un vide silencieux |
| KPI | "Citoyens reçus" / "Paiements validés" / "Chiffre du jour" / "Temps moyen" ("par validation, cette session" / "aucune validation encore") | Conservé | "Cette session" toujours précisé — jamais présenté comme une moyenne historique |
| Aide contextuelle | "Besoin d'aide ? Voir la procédure" + 3 étapes numérotées | Conservé | Discrète une fois l'agent formé (repliée par défaut) |

### Comparaison au standard international (Étape 6)
Niveau Toast POS/Square pour un centre de check-in avec encaissement : granularité honnête des états, double confirmation citoyen/agent avant tout encaissement, jamais de métrique enjolivée. Aucun texte ne nécessite de retouche — l'un des écrans les plus rigoureux du dashboard institution.

### Points nécessitant une validation
Aucun.

### Implémentation
Aucun changement de texte nécessaire. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 11 — Rendez-vous passés (`RdvPasseTab.tsx`, 447 lignes)

### Contexte
Centre d'historique niveau Salesforce Health Cloud/Stripe Dashboard : filtres période/recherche/statut, tri, cartes 4 colonnes, pagination, suivi/notes par RDV, export CSV, fiche détail. Titre déjà touché lors du balayage "&" (label "Date et heure").

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Nouveau texte | Justification |
|---|---|---|---|---|
| Bouton "Enregistrer" (note de suivi, état chargement) | "…" | Corrigé | "Enregistrement…" | Incohérent avec la convention verbe + ellipse déjà établie partout ailleurs (dont ce même fichier n'a pas d'autre occurrence du problème) |
| Titre | "Rendez-vous passés" + icône "Historique en lecture seule" | Conservé | — | Clair |
| Sous-titre | "Historique structuré de l'activité passée — organisez vos relances et suivis." | Conservé | — | Précis |
| Statuts | "Tous" / "Terminé" / "Annulé" / "Absent" (avec compteurs) | Conservé | — | Cohérent avec la fusion Effectué/Honoré→Terminé documentée en tête de fichier (l'enum réel n'a qu'une valeur de complétion) |
| État vide initial | "Votre historique commence ici" / "Une fois vos premiers rendez-vous terminés, ils apparaîtront ici avec tout ce qu'il faut pour organiser vos relances et suivis." | Conservé | — | Distingue bien le vrai premier lancement du "aucun résultat pour ces filtres" |
| État vide filtré | "Aucun rendez-vous trouvé pour ces filtres." | Conservé | — | Direct |
| Actions par statut | "Marquer un suivi" / "Rappeler ce client" (en attente) / "Voir le dossier" (terminé) / "Détails" (annulé) | Conservé | — | Actions contextuelles pertinentes selon le statut |
| Toasts | "Suivi enregistré" / "Rappel envoyé au client" / "Référence copiée" / "Aucun rendez-vous à exporter" | Conservé | — | Clair |
| Pagination | "Affichage de {n} à {n} sur {n} rendez-vous" | Conservé | — | Standard |

### Comparaison au standard international (Étape 6)
Niveau attendu pour un centre d'historique CRM. Après correction, aucun texte ne pose plus problème.

### Points nécessitant une validation
Aucun.

### Implémentation
1 correction appliquée (état de chargement du bouton "Enregistrer" note de suivi). Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 12 — Mes clients (`MesClientsTab.tsx`, 663 lignes)

### Contexte
Fiche client + timeline unifiée (RDV, présence QR, paiement, avis avec réponse, signalements admin, tâches, accès admin, messages) — remplace un ancien prototype localStorage. Bloc Notes à 5 types (privées/publiques/commentaires/observations/compte rendu), messagerie intégrée.

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Titre | "Mes clients" | Conservé | Clair |
| Sous-titre | "Chaque citoyen ayant déjà eu au moins un rendez-vous avec votre établissement, avec son historique complet." | Conservé | Précise bien le périmètre (jamais tous les citoyens de la plateforme) |
| KPI | "Total" / "Fidèles (3+)" / "Nouveaux (30j)" | Conservé | Seuils explicites dans le libellé |
| État vide | "Vos premiers clients apparaîtront ici" / "Dès qu'un citoyen prend rendez-vous avec votre établissement, il devient automatiquement un client — avec tout son historique de rendez-vous au même endroit." | Conservé | Explique le mécanisme |
| Fiche — badges | "RDV total" / "Client depuis" / "Nouveau"/"Régulier" / "Prochaine étape" | Conservé | Clair |
| Avis | "Votre réponse" / "Répondre" / "Envoyer" | Conservé | Direct |
| Bloc Notes | 5 types de notes, "Aucune note "{type}" pour l'instant — ajoutez la première ci-dessous." / "Ajouter une note {type}…" | Conservé | Placeholder contextuel au type sélectionné |
| Messagerie | "Aucun échange pour l'instant" / "Vos échanges avec {nom} apparaîtront ici dès qu'une conversation aura eu lieu." / "Ouvrir la conversation" | Conservé | Personnalisé au nom du client |
| Actions | "Envoyer un rappel" / "Fermer" | Conservé | Direct |

### Comparaison au standard international (Étape 6)
Niveau HubSpot CRM/Intercom pour une fiche client unifiée : timeline consolidée honnête ("rien de manuel, chaque entrée vient d'une donnée déjà écrite ailleurs", voir commentaire de code), notes typées, messagerie intégrée. Aucun texte ne nécessite de retouche.

### Points nécessitant une validation
Aucun côté texte. Note : ce fichier touche directement le point ouvert déjà documenté dans CLAUDE.md `/backlog-produit` (`stColor()` gère des statuts "absent"/"effectue"/"honore" non confirmés dans l'enum réel `statut_rdv`) — sujet de schéma/logique, pas de texte, non traité ici.

### Implémentation
Aucun changement de texte nécessaire. Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 13 — Disponibilités (`DisponibilitesTab.tsx`, 644 lignes)

### Contexte
Configuration des jours/heures d'ouverture par jour (accordéon), capacité par créneau, KPI exécutifs (jours ouverts, créneaux générés, capacité hebdomadaire, durée moyenne, amplitude, statut), aperçu citoyen réel (mêmes créneaux que le moteur de réservation), historique des modifications, écran alternatif honnête pour le secteur hôtellerie (bouton "Gérer chambres et prestations" déjà corrigé lors du balayage "&").

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Nouveau texte | Justification |
|---|---|---|---|---|
| Bouton "Enregistrer" (capacité, état chargement) | "…" | Corrigé | "Enregistrement…" | Incohérent avec la convention verbe + ellipse déjà établie |
| Titre | "Disponibilités" / "Configurez vos jours et heures d'ouverture. Les citoyens pourront réserver uniquement sur ces créneaux." | Conservé | — | Clair |
| Statut | "Non configuré" / "Modifications en attente" / "Configuration active" | Conservé | — | 3 états distincts, jamais ambigus |
| Écran hôtellerie (non applicable) | "Ne s'applique pas à votre établissement" / "Cet écran configure des créneaux horaires façon rendez-vous […] Pour un hôtel, chaque chambre ou prestation a déjà son propre tarif, son unité […] et ses horaires, réglés directement à sa création." | Conservé | — | Explique honnêtement pourquoi cet écran ne s'applique pas plutôt que de l'afficher vide ou cassé |
| Capacité par créneau | "Nombre de citoyens que vous pouvez recevoir au même horaire. Au-delà, un créneau affiche "Complet" côté citoyen." | Conservé | — | Explique l'effet concret côté citoyen |
| Aperçu citoyen (modal) | "Ce que voit un citoyen" / "Prochains créneaux réellement proposés à la réservation, sur les 7 prochains jours — même moteur que le formulaire de prise de rendez-vous." | Conservé | — | Honnête : "réellement", "même moteur" — pas une simulation approximative |
| Historique (modal) | "Historique des modifications" / "Aucune modification enregistrée pour l'instant." | Conservé | — | Clair |
| Barre de sauvegarde | "Modifications non enregistrées" / "Tout est à jour" / "{n} créneaux au total" / "Enregistrer" / "Enregistré" | Conservé | — | États clairs |
| Aperçu par jour | "Aperçu — {n} créneaux générés" + liste d'horaires + "+{n} autres" | Conservé | — | Prévisualisation concrète avant sauvegarde |

### Comparaison au standard international (Étape 6)
Niveau Calendly/Google Calendar pour une configuration de disponibilités récurrentes : aperçu citoyen réel (pas simulé), écran alternatif honnête pour les secteurs où le concept ne s'applique pas. Après correction, aucun texte ne pose plus problème.

### Points nécessitant une validation
Aucun.

### Implémentation
1 correction appliquée (état de chargement du bouton "Enregistrer" capacité). Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

---

**Groupe 2 (RDV & Clients) — clos.** 5 fichiers audités. Bilan : 2 corrections d'états de chargement ("…"→verbe+ellipse), 0 autre changement (le titre "Date et heure" et "Gérer chambres et prestations" avaient déjà été corrigés lors du balayage transversal "&"). Dossier globalement exemplaire, notamment ValiderRdvTab.tsx et CheckInUnavailableDialog.tsx sur l'honnêteté des états.

## Écran 14 — Équipe et accès (`EquipeTab.tsx`, 676 lignes)

### Contexte
Enterprise Access Center (RBAC) : liste des membres avec accès dashboard (distinct de Clock In Shift, voir tête de fichier), invitation, gestion de rôle, verrouillage/suspension/suppression, réinitialisation PIN, historique par membre, KPI exécutifs. Titre déjà corrigé lors du balayage "&" ("Équipe et accès").

### Inventaire, évaluation et décisions
| Élément | Texte actuel | Décision | Justification |
|---|---|---|---|
| Sous-titre | "Gérez les personnes autorisées à accéder à votre espace Yelen, leurs rôles, leurs permissions et la sécurité de leurs accès." | Conservé | Clair |
| État vide | "Votre équipe est vide" / "Invitez vos collaborateurs afin de leur attribuer un accès sécurisé à votre espace Yelen — chacun se connecte avec son propre identifiant et PIN, jamais votre compte principal." | Conservé | Explique pourquoi créer des comptes distincts (sécurité) |
| Statuts | "Actif" / "Invitation en attente" / "Suspendu" / "Verrouillé" | Conservé | "Invitation en attente" reste un choix de vocabulaire assumé (proxy `doit_changer_pin`, pas un vrai système d'invitation par email — décision déjà tranchée avec Bryan, documentée en tête de fichier) |
| Formulaire d'invitation | "C'est ce que le membre tapera pour se connecter — pas d'espace, unique dans tout Yelen224." / "Communiquez ce code au membre — il devra en choisir un nouveau dès sa première connexion." / "Envoyer l'invitation" | Conservé | Clair sur le mécanisme réel (code communiqué manuellement, pas un email automatique) |
| Toast création | "{prénom} a été invité(e) dans l'équipe" | Conservé | Cohérent avec le vocabulaire "invitation" déjà assumé |
| Fiche détail — badges | "Compte administrateur principal" / "PIN pas encore changé" | Conservé | Clair |
| Permissions | "Permissions ({n} écrans accessibles)" + tags avec "(lecture)" si accès limité | Conservé | Transparent sur l'étendue réelle des accès |
| Suspension/réactivation | "Suspendre" / "Réactiver" / "Membre suspendu — il ne peut plus se connecter" / "Membre réactivé" | Conservé | Explique la conséquence immédiate |
| Suppression (ConfirmModal) | "Ce n'est pas une suspension : le compte est définitivement supprimé, pas seulement désactivé." / "{prénom} ne pourra plus se connecter avec cet identifiant." / "Retrouver l'accès nécessitera de recréer un nouveau compte." | Conservé | Distingue explicitement suppression et suspension — évite toute confusion sur la réversibilité |
| PIN | "Réinitialiser le PIN" / "Nouveau PIN à 6 chiffres pour {prénom} :" / "PIN réinitialisé — communiquez-le au membre" | Conservé | Clair |

### Comparaison au standard international (Étape 6)
Niveau Okta/Google Workspace Admin pour un centre d'accès RBAC : distinction claire suppression/suspension, transparence sur les permissions réelles par rôle, vocabulaire "invitation" assumé malgré un mécanisme simplifié (pas de dérive marketing). Aucun texte ne nécessite de retouche.

### Points nécessitant une validation
Aucun.

### Implémentation
Aucun changement de texte supplémentaire (titre déjà corrigé lors du balayage "&"). Non vérifié dans un navigateur ; `npx tsc --noEmit` à confirmer par Bryan.

## Écran 3.2 — Clock In Shift (`ClockInShiftTab.tsx`)

### Contexte
Module Enterprise de pointage employé — le plus gros fichier du dashboard
institution (2586 lignes). 4 sous-vues (`?subtab=`) : Présences (centre de
supervision temps réel), Employés (CRUD + fiche détail), Départements
(CRUD + stats), Horaires (modèles de planning). Population employés
distincte des membres dashboard (voir CLAUDE.md `/modules-livres`).

### Inventaire, évaluation, décisions
Relecture intégrale (4 passes de lecture, ~650 lignes chacune). Aucun
texte visible ne nécessite de correction :
- Zéro "&" hors contexte compact (grep dédié en amont, confirmé négatif).
- Zéro "QR Code" mal casé (fonctionnalité absente de ce module, V1 sans
  géofencing/QR — voir CLAUDE.md).
- Zéro `window.confirm()` (grep dédié en amont, confirmé négatif).
- Zéro état de chargement en "…" bare — tous les boutons d'action
  utilisent la prop `loading` du composant `Button` partagé (spinner
  visuel), pas de texte manuel à faire varier.
- Libellés (`ROLES`, `STATUTS`, `TYPES_HORAIRE`, titres de section, textes
  d'état vide des 4 illustrations sur mesure) tous en français naturel,
  cohérents avec le reste du dashboard.
- "IA Insights"/"Analyse automatique" : phrases générées par règles
  déterministes, zéro donnée inventée (delta KPI employés volontairement
  absent — commentaire en tête de fichier explique l'absence de table
  d'audit historique justifiant ce choix, disciplien identique à
  `ValiderRdvTab.tsx`).

### Comparaison au standard international (Étape 6)
Conforme. Ton, casse, cohérence terminologique et discipline anti-donnée-
inventée déjà au niveau attendu — aucune réécriture nécessaire.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune observation nouvelle (fonctionnel/logique déjà couvert par l'audit
technique antérieur, voir CLAUDE.md `/modules-livres`).

### Implémentation
Aucune modification — 0 édition.

**Statut : clos, 0 édition.**

## Groupe 4 — Finance (`FinanceAccueilTab`, `TransactionsTab`, `PaiementsTab`, `FacturationTab`, `HistoriqueFinancierTab`, `DocumentsFinanciersTab`)

### Contexte
6 écrans du domaine comptable : tableau de bord, journal des transactions
(insert-only), paiements (avec remboursement), facturation, historique
consultatif, documents financiers. Relecture intégrale des 6 fichiers.

### Inventaire, évaluation, décisions
- **`FinanceAccueilTab.tsx`** : 0 problème. RAS.
- **`TransactionsTab.tsx`** : 0 problème. RAS — discipline honnêteté déjà
  exemplaire (statuts "Reversée"/"Validée" documentés en commentaire).
- **`PaiementsTab.tsx`** : 0 problème. RAS.
- **`FacturationTab.tsx`** : **1 correction**. Le document imprimable
  généré par "+ Générer une facture" affichait `Reçu {facture.numero}`
  en en-tête alors qu'il s'agit d'une facture (`FactureDetail`, toast de
  confirmation "Facture X générée"). CLAUDE.md documente une distinction
  explicite Reçu ≠ Facture (décision Bryan, module Reçus Yelen) — cette
  étiquette confondait les deux concepts. → `Facture {facture.numero}`.
- **`HistoriqueFinancierTab.tsx`** : **1 correction**. La colonne
  "Statut" du tableau affichait l'enum brut de la base (`confirme`,
  `en_attente`, `annule`...) au lieu d'un libellé français, contrairement
  à tous les autres écrans du domaine (`PaiementsTab.tsx` a déjà un
  `STATUT_LABEL`). Ajout d'une table de correspondance locale identique.
- **`DocumentsFinanciersTab.tsx`** : 0 problème. RAS — substitutions de
  champs (Montant→Taille, Citoyen→Ajouté par, etc.) déjà documentées et
  honnêtes en tête de fichier.

### Comparaison au standard international (Étape 6)
Conforme après corrections. Les deux défauts trouvés (facture étiquetée
"Reçu", statut brut non traduit) sont exactement le type d'incohérence
qu'un audit Stripe/Notion éliminerait avant mise en production.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
2 fichiers modifiés, 2 corrections au total (1 par fichier concerné).

**Statut : clos.**

## Groupe 5 — Offres & Partenariat (`MesOffresIntro`, `MesOffresTab`, `MesOffresOffreDetail`, `MesOffresAnalytics`, `MesOffresPerformanceChart`, `MesOffresTable`, `PartenariatTab`, `MonPartenariatTab`)

### Contexte
8 fichiers du "Centre de pilotage des offres" et du programme de
partenariat Yelen. Relecture intégrale des 8 fichiers.

### Inventaire, évaluation, décisions
0 problème sur l'ensemble du groupe. RAS partout.
- `CATEGORIES` de `MesOffresTab.tsx` contient "Télécom & Média" et
  "Commerce & PME" — déjà vérifié (chantier citoyen) : rendu via
  `ChipSelect`, contexte compact conforme à la règle "&", pas de
  correction.
- Discipline anti-donnée-inventée déjà exemplaire partout (deltas
  hebdomadaires réels uniquement, CTR "—" si zéro vue plutôt que 0%,
  `MonPartenariatTab.tsx` retire explicitement 3 notions du cahier des
  charges sans source de données réelle plutôt que de les inventer).

### Comparaison au standard international (Étape 6)
Conforme. Aucune réécriture nécessaire.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
Aucune modification — 0 édition sur les 8 fichiers.

**Statut : clos, 0 édition.**

## Groupe 6 — Communication & Communauté (`CommunicationTab`, `CommunauteProTab`, `MessagerieTab`, `QuestionsClientsTab`, `SupportYelenTab`)

### Contexte
5 fichiers parmi les plus volumineux du dashboard (jusqu'à 1635 lignes) :
Annonces (multi-format), Yelen Community Pro (5 sous-vues), Messagerie V2
(conversations), Questions publiques pré-RDV, Support Yelen (ticketing).
Relecture intégrale des 5 fichiers, en plusieurs passes pour les plus
longs.

### Inventaire, évaluation, décisions
- **`CommunicationTab.tsx`** (1134 lignes) : 0 problème. RAS.
- **`CommunauteProTab.tsx`** (1635 lignes) : 0 problème. RAS — discipline
  anti-donnée-inventée et états vides "réels" (jamais un dashboard de
  zéros) particulièrement soignés sur ce fichier.
- **`MessagerieTab.tsx`** (833 lignes) : **1 correction**. Un message
  d'erreur (établissement suspendu) référence le panneau d'aide de
  l'en-tête par son ancien nom `Aide &amp; ressources`, alors que ce
  libellé a déjà été corrigé en `Aide et ressources` dans `layout.tsx`
  plus tôt dans ce chantier (règle "&"). Corrigé pour rester cohérent
  avec le libellé réel actuel de l'interface.
- **`QuestionsClientsTab.tsx`** : 0 problème. RAS.
- **`SupportYelenTab.tsx`** : 0 problème. RAS (seule occurrence de "Aide &
  ressources" trouvée est un commentaire de code, hors périmètre texte).

### Comparaison au standard international (Étape 6)
Conforme après correction. Aucun autre écart trouvé.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
1 fichier modifié (`MessagerieTab.tsx`), 1 correction.

**Statut : clos.**

## Groupe 7 — Documents & Signalements (`DocumentsTab`, `DocumentsClientsTab`, `SignalementsTab`)

### Contexte
3 écrans de case management niveau "Enterprise" déjà audités techniquement
lors du chantier de consolidation antérieur (voir CLAUDE.md
`/modules-livres`) : documents institutionnels (vérification KYC),
documents clients (boîte de réception + workflow), signalements
(bilatéral institution/citoyen, arbitrage réservé à Yelen depuis le
15/08/2026). Relecture intégrale des 3 fichiers.

### Inventaire, évaluation, décisions
0 problème sur l'ensemble du groupe. RAS partout — ces 3 écrans avaient
déjà fait l'objet d'un audit dédié (Lots 1-5 Documents clients, Lots 1-2
Signalements) avec correctifs de fond ; aucun défaut textuel résiduel
trouvé en relecture éditoriale.

### Comparaison au standard international (Étape 6)
Conforme. Aucune réécriture nécessaire.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
Aucune modification — 0 édition sur les 3 fichiers.

**Statut : clos, 0 édition.**

## Groupe 8 — Rapports & Analyse (`RapportsTab`, `CentreAnalyseTab`, `AvisReputationTab`)

### Contexte
3 écrans "Executive"/"Enterprise" niveau data-intensif — Rapports
financier/opérationnel, Centre d'Analyse (6 sous-onglets : Vue d'ensemble,
Tunnel, Heatmap, Géographie, Mes clients, Performances), Santé du compte
(score réputation). `CentreAnalyseTab.tsx` est le plus long fichier
relu dans ce chantier après `CommunauteProTab.tsx` (1483 lignes).
Relecture intégrale des 3 fichiers.

### Inventaire, évaluation, décisions
0 problème sur l'ensemble du groupe. RAS partout — discipline
anti-donnée-inventée exemplaire et cohérente sur les trois fichiers
(stubs honnêtes "Bientôt disponible" pour Performances par appareil,
seuils d'échantillon minimal avant d'afficher une tendance, "Pas de
comparaison disponible" plutôt qu'un delta fabriqué, état vide dédié
"Pas encore assez d'avis" avec barre de progression réelle).

### Comparaison au standard international (Étape 6)
Conforme. Aucune réécriture nécessaire.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
Aucune.

### Implémentation
Aucune modification — 0 édition sur les 3 fichiers.

**Statut : clos, 0 édition.**

## Groupe 9 — Compte & Système (`CompteSuspenduScreen`, `LogoutFlow`, `ConditionsInformationsTab`, `CodeQrTab`, `EspaceTravailTab`, `JournalTab`, `ServicesTab`)

### Contexte
Dernier groupe du chantier institution : écran de suspension ("centre de
résolution"), flux de déconnexion, conditions/informations légales, QR
code de partage, wrapper Espace de travail, Journal d'activité (audit
log), Services payants + Offre gratuite. Relecture intégrale des 7
fichiers.

### Inventaire, évaluation, décisions
- **`CompteSuspenduScreen.tsx`** : **1 correction**. Bouton d'accès rapide
  "Paramètres &amp; Compte" dans une grille de 2 boutons de navigation
  (12.5px, pas une puce compacte) → "Paramètres et compte", conforme à la
  règle "&" déjà appliquée partout ailleurs dans ce chantier.
- **`LogoutFlow.tsx`** : 0 problème. RAS.
- **`ConditionsInformationsTab.tsx`** : déjà corrigé lors du balayage
  transversal "&" initial (H1 "Conditions & Informations" →
  "Conditions et informations"). Reste du fichier relu, RAS.
- **`CodeQrTab.tsx`** : 0 problème. "Mon code QR" est la forme française
  correcte (nom + acronyme), à ne pas confondre avec la faute "QR Code"
  (capitale erronée sur "Code") déjà corrigée ailleurs dans ce chantier.
- **`EspaceTravailTab.tsx`** : 0 problème (wrapper fin, 75 lignes — les 5
  sous-sections qu'il assemble vivent dans `app/[slug]/[id]/espace-travail/
  components/`, hors périmètre déclaré de ce chantier dashboard).
- **`JournalTab.tsx`** : 0 problème. RAS.
- **`ServicesTab.tsx`** (1288 lignes) : 0 problème textuel. `window.confirm()`
  toujours présent (suppression de service) — déjà documenté comme
  défaut hors périmètre (fonctionnel, pas texte) ailleurs dans ce
  chantier, pas re-signalé en double ici.

### Correction supplémentaire — écart trouvé lors de la vérification finale
En reprenant ce travail après une interruption, le résumé de session
signalait un doute : le libellé de navigation `layout.tsx` pour l'entrée
`conditions-informations` (`"Conditions & Informations"`, ligne ~2679)
avait-il réellement été corrigé lors du balayage transversal "&" du début
de ce chantier, comme les autres entrées (`avis-reputation`, `help`,
`Abonnement & Forfait`, `Aide & FAQ`) ? Vérification par grep : **non**,
il ne l'avait pas été — le H1 de `ConditionsInformationsTab.tsx` avait
été corrigé mais pas le libellé de navigation qui y mène. Corrigé
maintenant → `"Conditions et informations"`, cohérent avec l'écran cible.

### Comparaison au standard international (Étape 6)
Conforme après corrections. Aucun autre écart trouvé.

### Points nécessitant une validation
Aucun.

### Observations hors périmètre
`ServicesTab.tsx::handleDelete` utilise toujours `window.confirm()` —
défaut fonctionnel déjà connu et documenté (pattern répété sur plusieurs
écrans du dashboard), pas un problème de texte.

### Implémentation
2 fichiers modifiés (`CompteSuspenduScreen.tsx`, `layout.tsx`), 2
corrections au total.

**Statut : clos.**

## Clôture du chantier — CHANTIER HUMANISATION ÉDITORIALE, côté institution

Les 9 groupes (Profil & Configuration, RDV & Clients, Équipe & Clock In
Shift, Finance, Offres & Partenariat, Communication & Communauté,
Documents & Signalements, Rapports & Analyse, Compte & Système) sont
clos. Environ 47 fichiers du dashboard institution relus intégralement,
en mode continu de bout en bout comme demandé. Total : une quinzaine de
corrections textuelles, très majoritairement des occurrences de la règle
"&" (contexte non compact) et quelques incohérences de libellés
cross-écran (référence à un nom d'écran déjà renommé ailleurs, statut
brut de base de données affiché sans traduction). Aucune correction de
fond, de logique métier, de sécurité ou de donnée inventée n'a été
nécessaire — le dashboard institution était déjà, dans son immense
majorité, rédigé au niveau attendu.
