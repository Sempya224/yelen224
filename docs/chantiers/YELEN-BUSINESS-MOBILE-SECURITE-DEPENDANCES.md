# Sécurité des dépendances — mobile/ (chantier séparé)

Statut : **Audit réalisé le 05/10/2026, décision CEO actée le même jour.**
Chantier distinct de `YELEN-BUSINESS-MOBILE.md` (qui couvre le périmètre
fonctionnel/architecture) — celui-ci ne traite que la dette de sécurité
`npm audit` du projet `mobile/`, à faire évoluer indépendamment des phases
d'implémentation.

## Déclencheur

`npx expo install expo-image-picker` (ajouté pour l'écran Entreprise, voir
`YELEN-BUSINESS-MOBILE.md`) a fait apparaître 30 vulnérabilités `npm audit`
(11 moderate, 19 high). `npm audit fix` (sans `--force`) exécuté le
05/10/2026 — a corrigé ce qui était corrigeable sans casse (10 paquets
remplacés), les 30 restantes nécessitent toutes `--force`.

## Décision CEO (05/10/2026)

> **Pas de `npm audit fix --force`. Pas de downgrade Expo 57 → 44. Pas de
> migration Expo 57 → 58 dans le cadre de ce nettoyage sécurité.** On
> conserve l'état fonctionnel actuel et on traite les 30 vulnérabilités une
> par une, par cause racine, avec priorité aux vulnérabilités réellement
> présentes dans le bundle/runtime de production — pas un `--force` aveugle.

Vérifié avant de trancher : les versions `fixAvailable` proposées par npm
(`expo@44.0.6`, `react-native@0.72.17`, `expo-splash-screen@55.0.25`,
`react-native-reanimated@4.2.2`, `react-native-worklets@0.7.4`) sont
toutes des **downgrades** par rapport aux versions réellement installées
(`expo` 57.0.26, `react-native` 0.86.3, etc.) — pas des mises à jour.
Confirmé sur le registre npm : **aucune version plus récente n'existe dans
la lignée SDK 57** pour `expo`/`expo-router`/`expo-splash-screen`, les
dernières versions publiées sont toutes en 58.x. Ce n'est pas un choix de
résolution malheureux de npm, c'est qu'il n'existe structurellement aucun
patch 57.x à appliquer — seule la migration SDK 58 (explicitement reportée
par le CEO) réglerait ça proprement.

## Détail par cause racine (6 paquets directs, 24 transitifs)

| Paquet direct | Déclaré | `fixAvailable` npm | Nature réelle |
|---|---|---|---|
| `expo` | 57.0.26 | `expo@44.0.6` | Downgrade (13 majeures) |
| `react-native` | 0.86.3 | `react-native@0.72.17` | Downgrade (pré-New Architecture) |
| `expo-router` | 57.0.24 | `expo-router@58.0.13` | Upgrade réel, mais saut SDK 57→58 |
| `expo-splash-screen` | 57.0.9 | `expo-splash-screen@55.0.25` | Downgrade |
| `react-native-reanimated` | 4.5.1 | `react-native-reanimated@4.2.2` | Downgrade |
| `react-native-worklets` | 0.10.1 | `react-native-worklets@0.7.4` | Downgrade |

### Groupe 1 — `expo` (build-time uniquement)
Transitifs : `@expo/cli`, `@expo/config*`, `@expo/metro*`,
`@expo/prebuild-config`, `@expo/code-signing-certificates`, `node-forge`,
`braces`, `micromatch`, `xcode`, `uuid`.
- **Environnement** : 100% outillage (CLI, prebuild, signature EAS) — ne
  tourne jamais dans le bundle livré sur le téléphone d'un citoyen ou
  d'une institution.
- **Impact réel** : limité à la machine de dev/CI (ex. ReDoS
  `braces`/`micromatch` sur un chemin de fichier pathologique pendant le
  bundling, parsing `node-forge` pour la signature de certificats EAS).
  Zéro exposition utilisateur final.
- **Décision** : accepté tel quel, à réévaluer à la migration SDK 58.

### Groupe 2 — `react-native` (metro + CLI, build-time)
Transitifs : `@react-native/community-cli-plugin`,
`@react-native/metro-config`, `metro`, `metro-config`,
`metro-transform-worker`, `@react-native/virtualized-lists`.
- **Environnement** : bundler/CLI (build-time), sauf
  `@react-native/virtualized-lists` — mais celui-ci n'a aucune CVE propre
  listée, il apparaît seulement par cascade ("dépend de react-native
  vulnérable").
- **Décision** : accepté.

### Groupe 3 — `expo-router` → `query-string` → `decode-uri-component` (RUNTIME réel)
- **Environnement** : runtime — `expo-router` décode des deep links/
  paramètres d'URL en conditions réelles.
- **CVE** : ReDoS (déni de service CPU) sur une URL percent-encodée
  malformée. Sévérité modérée, nécessite qu'un lien malveillant soit
  ouvert par l'app — pas une fuite de données. **Seul des 30 avec un
  vecteur d'attaque concret et plausible côté production.**
- **Fix propre disponible sans toucher à Expo/React Native** :
  `decode-uri-component` a une version patchée (`0.5.0`, installée
  actuellement : `0.2.2`). `query-string@7.1.3` déclare `^0.2.2` mais son
  API n'a pas changé entre ces versions (seul le regex a été corrigé). Un
  `overrides` npm ciblé sur ce seul paquet corrigerait ce point **sans
  aucun changement de version d'Expo/React Native/expo-router**.
- **Statut** : ⏳ **proposé à Bryan, pas encore appliqué** (en attente de
  son feu vert explicite).

### Groupe 4 — `expo-splash-screen` → `@expo/config-plugins` → `xcode` → `uuid` (build-time)
- **Environnement** : plugin de configuration native (build-time), pas le
  rendu runtime du splash screen lui-même.
- **Décision** : accepté.

### Groupe 5 — `react-native-reanimated` et Groupe 6 — `react-native-worklets` (runtime)
- Aucun détail de CVE texte fourni par npm au-delà de "dépend de
  react-native/l'un de l'autre vulnérable" — pas une faille propre à ces
  paquets.
- **Décision** : accepté, à revérifier au prochain `expo install --fix`
  dans la lignée 57.

## Bilan

29 des 30 vulnérabilités : soit du build-time (zéro exposition prod), soit
sans fix sain disponible avant la migration SDK 58 (reportée) — documentées
comme risque accepté/différé. **1 seule actionnable immédiatement** sans
aucune casse : l'override `decode-uri-component` du Groupe 3.

## Reste à faire
- [ ] Décision de Bryan sur l'override `decode-uri-component` (Groupe 3).
- [ ] Réévaluer l'intégralité de ce document au moment de la migration SDK
      58 (planifiée séparément, voir `YELEN-BUSINESS-MOBILE.md`) — plusieurs
      de ces vulnérabilités tombent probablement d'elles-mêmes à ce moment.
- [ ] Revérifier après chaque `npx expo install --fix`/mise à jour de
      paquet dans la lignée 57.x, au cas où un patch 57.x sortirait entre
      temps pour `react-native`/`expo-splash-screen`.
