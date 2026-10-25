# Typographie — alignement dashboard institution sur dashboard admin

Démarré 16/10/2026, décision CEO : donner au dashboard institution les
mêmes tailles de police que le dashboard admin. Aucun des deux dashboards
n'avait de token de taille de texte centralisé avant ce chantier — chaque
écran fixe `fontSize` en dur par occurrence (`app/admin/adminTheme.ts` et
`app/[slug]/[id]/theme.ts` n'ont ni l'un ni l'autre de palier typographique,
seulement couleurs/radius/ombres). "Aligner" veut donc dire repasser
composant par composant, jamais un changement de token unique — chantier
multi-session, 2 fichiers max par session (règle CLAUDE.md).

## Échelle cible (dérivée des vraies fréquences admin, pas inventée)

Mesurée par comptage réel sur `app/admin/**` (`grep -c` sur chaque valeur) :

| Taille | Occurrences admin | Rôle typique |
|---|---|---|
| 10px | 62 | Label/eyebrow micro (majuscule), badge, hint |
| 10.5px | 10 | Variante label légèrement plus respirée |
| 11px | 111 | Label, badge, texte secondaire |
| 11.5px | 26 | Corps de texte compact |
| 12px | 167 | **Taille dominante** — corps de texte standard, cellule de tableau |
| 12.5px | 73 | Bouton, onglet, input |
| 13px | 128 | Paragraphe, description |
| 13.5px | 5 | Variante paragraphe |
| 14px | 7 | Emphase légère (rare, mais réel — pas un outlier) |
| 15px | 8 | Titre de section / dialog, stat secondaire emphasée |
| 18px | 1 | Outlier isolé — **ne pas copier**, trop rare pour faire foi |
| 20px | 12 | Titre de page (h1), valeur numérique forte (nom, montant hero) |
| 22px | 18 | Titre de page (h1) — variante haute, aussi fréquente que 20px |
| 24px | 3 | Titre d'écran exceptionnel, valeur KPI compacte |
| 28px | 2 | Hero exceptionnel — `adminUiKit.tsx::KpiCard` (valeur canonique partagée), note moyenne `satisfaction/page.tsx` |

Règle de snap : toute taille institution absente de cette échelle doit être
ramenée à la valeur la plus proche **selon le rôle réel du texte** (jamais
un arrondi arithmétique aveugle — un nom de citoyen en avant et une
mini-stat secondaire qui partageaient la même taille d'origine peuvent
atterrir sur deux paliers différents si leur poids visuel diffère).

## Exceptions documentées (ne font PAS partie de l'alignement)

- **Cases de saisie du code citoyen** (`ValiderRdvTab.tsx`, 6 cases à
  30px + séparateur "–" à 18px) : composant de saisie spécialisé, pas un
  texte d'UI comparable à l'échelle admin — une police à 10-13px y serait
  illisible. Laissé tel quel sciemment, pas un oubli.
- **Initiales d'avatar** (`layout.tsx`, lignes 1847/3645/5395 — fiche RDV,
  résultat scan, carte RDV liste) : taille proportionnelle au diamètre du
  cercle (48-56px), pas un rôle de texte d'UI classique — laissées à
  16-18px plutôt que forcées sur l'échelle.
- **Icône emoji 🔒** (`layout.tsx` ligne 441, bandeau sécurité) : taille
  d'icône, pas de texte — laissée à 16px.

## Suivi par fichier

- [x] **`app/[slug]/[id]/components/ValiderRdvTab.tsx`** (16/10/2026) —
  105 occurrences, 9 déjà alignées sur l'échelle admin sans rien faire
  (11/11.5/12/12.5/13/13.5/14/15/20/22px déjà dans la liste ci-dessus).
  17 occurrences effectivement corrigées : 9px→10px (×1), 9.5px→10px (×9,
  tous des eyebrows "Arrivée/Départ/Nuits/Date/Heure/Durée prévue/Mode/
  Réservé par/déclare avoir remis"), 16px→15px (×3 : titre MotifModal,
  montant paiement du header repliable, "Réservations x/y" sidebar),
  17px→20px (×1 : bandeau succès "Paiement confirmé."), 18px→15px (×1 :
  total historique Yelen, mini-stat), 19px→20px (×2 : nom du citoyen en
  tête de fiche, h2 "Entrer le code citoyen"). 2 exceptions laissées
  (voir ci-dessus).
- [x] **`app/[slug]/[id]/layout.tsx`** (16/10/2026) — d'abord reporté
  (décision CEO 15/10/2026, trop gros pour une session), puis traité en
  entier le lendemain sur demande explicite. 333 occurrences, la grande
  majorité déjà alignée sans rien faire. 48 corrections effectives :
  - 8px→10px (×4) et 9px→10px (×18) et 9.5px→10px (×7) : badges/pastilles
    micro, labels de légende, compteurs de notification, eyebrows de menu
    (29 occurrences au total, même rôle que le lot ValiderRdvTab).
  - 16-18px→15px (×8) : titres de panneaux/tiroirs ("Détails du RDV",
    "Organisation", "Yelen Business", "Scanner le Client", "Motif du
    refus", "Terminer ce rendez-vous ?"), noms de citoyen en ligne à côté
    d'un avatar inline 48-52px (scan QR, fiche RDV, demande reçue), date du
    jour dans la mini-carte RDV liste.
  - 17px→20px (×1) : bandeau succès "Présence confirmée" (ScannerModal),
    même rôle que "Paiement confirmé." déjà traité côté ValiderRdvTab.
  - 26px→24px (×3) : grille KPI compacte Vue d'ensemble (6 cartes
    Activité/À traiter/Résultat) + cartes secondaires Semaine/Mois —
    aligné sur `app/admin/analytiques/page.tsx` (24px, même rôle "valeur
    KPI compacte").
  - 26px→28px (×1, h2 carousel d'onboarding "Guide") et 34px→28px (×1,
    hero "Aujourd'hui") et 30px→28px (×1, score santé compte) et
    36px→28px (×1, note moyenne avis) : tous alignés sur le tier "hero"
    d'admin (`adminUiKit.tsx::KpiCard`, `satisfaction/page.tsx`).
  - 16px→14px (×1) : suffixe "/5" à côté de la note moyenne — calque exact
    du précédent admin `satisfaction/page.tsx` (28px + 14px "/5").
  - 4 exceptions laissées (voir ci-dessus : avatars ×3, emoji 🔒 ×1).
- [x] **Sidebar gauche uniquement** (16/10/2026, demande explicite Bryan —
  "visuellement c'est la seule chose qui me dérange") : icônes de nav
  passées de 20×20 à **15×15px** (21 icônes `navSectionsRaw` + 2 icônes de
  groupe `FINANCE_GROUPS`), calque exact de `app/admin/adminIcons.tsx::Ic`
  (15×15px partout). Texte des items de nav passé de 13px à **13.5px**
  (calque exact de `app/admin/layout.tsx` ligne 298). Scope volontairement
  limité à la vraie sidebar gauche (`renderNavItem`/`FINANCE_GROUPS`) —
  exclut le panneau "Compte" (`accountItemsRaw`/`EQUIPE_TRAVAIL_GROUPS`,
  déjà à 16px, commentaire explicite "pas la sidebar principale") et le
  tiroir "Yelen Business" (`YELEN_BUSINESS_SECTIONS`, explicitement "pas
  depuis la sidebar gauche" — flyout du header), tous deux non concernés
  par la demande.
- [ ] Reste de `app/[slug]/[id]/components/*.tsx` (non commencé).
