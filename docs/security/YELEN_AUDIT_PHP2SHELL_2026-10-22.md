# YELEN224 — Audit PHP2Shell (CVE-2026-109618 / CVE-2026-109619)

Date de l'audit : 22/10/2026 — Mode : lecture seule (aucune modification de code, base, config, dépendance ; aucun déploiement ; aucun exploit lancé).
Branche auditée : `chore/securisation-accumulation-18-09-2026` (working tree local, Windows 11).

## 1. Référence des avis (sources externes, non vérifiées par Yelen)

- Deux failles dans le **moteur PHP** (CVSS v4.0 9.2) : CVE-2026-109618 (use-after-free, unserializer upload-progress) et CVE-2026-109619 (use-after-free, backtrace d'erreur fatale + type confusion OPcache).
- Affectent PHP >= 5.4 sous **mod_php et PHP-FPM**. Correctifs publiés le 21/10/2026 : **8.2.35, 8.3.36, 8.4.27, 8.5.12**. PHP <= 8.1 : pas de release officielle (backports distributions).
- Les PoC publics exigent des conditions supplémentaires (souvent une LFI applicative) ; exploitation signalée avant divulgation (Cloudflare, 21/10/2026 ~07:43 UTC).
- Seul un runtime **PHP** est concerné ; les sources n'indiquent aucun impact sur d'autres piles.
- Sources : sansec.io/research/php2shell, tenable.com (FAQ PHP2Shell), vulncheck.com, securitylabs.datadoghq.com, helpnetsecurity.com (21/10/2026), en.wikipedia.org/wiki/PHP2Shell. L'avis officiel php.net n'a pas été consulté directement : à confirmer.

## 2. Méthode et preuves collectées

| # | Preuve | Résultat |
|---|--------|----------|
| E1 | `git ls-files` filtré `.php/.phtml/.phar/Dockerfile/docker-compose/composer/.htaccess/php.ini` | 0 fichier suivi |
| E2 | `netlify.toml` | build `npm run build`, plugin `@netlify/plugin-nextjs` ; aucun runtime PHP, aucune fonction PHP |
| E3 | `.github/workflows/ci.yml` | job Node uniquement (build + tsc + audit), `ubuntu-latest`, ne déploie rien |
| E4 | `package.json` / `node_modules/next` | Next.js (local installé 16.4.2, déclaré ^16.3.5), React 19.2.4, Node local v24.16.0 |
| E5 | grep `php` dans package-lock.json (racine + `mobile/`) | uniquement des faux positifs (hash d'intégrité base64) |
| E6 | recherche de `*.php`/binaire php dans `node_modules` (profondeur 3) | 1 fichier : `node_modules/flatted/php/flatted.php` (utilitaire fourni par le paquet npm `flatted`, jamais exécuté, non déployé) |
| E7 | `supabase/functions/*` | 10 Edge Functions Deno/TypeScript |
| E8 | références `.php`/wp-admin/phpinfo dans `proxy.ts`, `lib/`, `app/` | à confirmer (la commande a été lancée avec les autres, sortie vide) |
| E9 | Recherche web des avis | voir section 1 |

Non réalisé (hors périmètre lecture seule / non accessible depuis cet environnement) : consultation du dashboard Netlify/Supabase, journaux d'accès de production, inspection de l'image d'exécution Netlify, requêtes sur le domaine public.

## 3. Rapport par actif

| Actif | Env. | Technologie | Version observée | Source de preuve | Exposition | Statut | Action recommandée |
|---|---|---|---|---|---|---|---|
| Application web Yelen224 (citoyen/institution/admin, routes API) | Prod (Netlify) | Next.js App Router, Node.js (fonctions serverless via `@netlify/plugin-nextjs`) | Next 16.3.x–16.4.x (à confirmer côté prod), Node géré par Netlify | E1–E4 | Internet | **CONFIRMÉ NON CONCERNÉ** pour les CVE PHP2Shell (aucun PHP dans le code ni la config de déploiement ; la stack déclarée est Node) — réserve : la couche d'exécution gérée par Netlify n'est pas inspectable | Aucune action PHP. Garder la mise à jour Next déjà faite le 18/09 |
| CI GitHub Actions | CI | Runner Ubuntu + Node | — | E3 | Non exposé (aucun service) | **CONFIRMÉ NON CONCERNÉ** (aucun serveur PHP en écoute) | Aucune |
| Fichier `flatted/php/flatted.php` | Dev (node_modules) | Sérialiseur PHP livré dans un paquet npm | non applicable | E6 | Non servi, non déployé (non tracké git) | **CONFIRMÉ NON CONCERNÉ** (fichier inerte, pas de runtime PHP) | Aucune ; bruit attendu pour tout scanner de fichiers |
| Supabase (Postgres 17, Auth, PostgREST, Realtime, Storage) | Prod (projet `pgcabxgrgjgukuagpuhc`) | Services managés par Supabase | `major_version = 17` (config.toml) | E7 + connaissance publique de l'architecture Supabase (non PHP) | Internet (API) | **INCONNU — PREUVE MANQUANTE** (aucun avis/attestation Supabase consulté ; architecture publique non PHP mais non vérifiable ici) | Consulter le statut/avis sécurité Supabase ; sinon classer non concerné sur preuve éditeur |
| Edge Functions Supabase (10) | Prod | Deno / TypeScript | — | E7 | Internet/cron | **CONFIRMÉ NON CONCERNÉ** (code TypeScript, pas de PHP) | Aucune |
| Netlify (plateforme d'hébergement, CDN, build image) | Prod | Plateforme managée | inconnue | E2 | Internet | **INCONNU — PREUVE MANQUANTE** (aucun avis Netlify consulté ; le code n'exécute pas PHP mais l'image de build n'est pas inspectée) | Vérifier le blog/statut sécurité Netlify pour PHP2Shell |
| Cloudflare (planifié 21/10 pour yelen224.com) | Prod/futur | WAF/CDN managé | — | CLAUDE.md, mémoire projet | Internet | **INCONNU — PREUVE MANQUANTE** (état réel du déploiement non vérifié ; non PHP) | Rien côté PHP ; utile en défense (règles WAF PHP2Shell si proposées) |
| `mobile/` (Expo / React Native) | Dev/futur | JS/TS | — | E5 | Client mobile | **CONFIRMÉ NON CONCERNÉ** | Aucune |
| Poste dev Bryan (Windows) | Dev | Node 24.16.0 | — | E4 | Non exposé | **CONFIRMÉ NON CONCERNÉ** pour ce poste (pas de PHP vérifié dans le dépôt ; PHP éventuellement installé hors dépôt non vérifié : `php -v`) | `php -v` optionnel à titre d'hygiène |

Aucun actif classé **SIGNE DE COMPROMISSION À INVESTIGUER** : aucune preuve de compromission antérieure n'a pu être examinée (journaux de prod non accessibles) — ce n'est pas une preuve d'absence.

## 4. Preuves manquantes / systèmes non vérifiés

1. Journaux d'accès Netlify et Supabase sur 20–22/10/2026 (requêtes `multipart/form-data` anormales, 5xx/OOM, chemins `.php`).
2. Avis officiels Supabase et Netlify sur PHP2Shell.
3. Avis officiel php.net (les CVE ont été lus via des relais tiers).
4. État réel Cloudflare/DNS (domaine yelen224.com).
5. Présence éventuelle de PHP sur le poste de développement (hors dépôt).

## 5. Synthèse des risques

- **Risque direct PHP2Shell pour Yelen224 : très faible.** Le produit est entièrement TypeScript (Next.js, Deno, Postgres managé). Le critère « pas de fichier PHP » n'est pas la seule base : confirmé aussi par la configuration de build/déploiement (Netlify Next.js, CI Node) et l'absence de conteneur/image PHP dans le dépôt.
- **Risque résiduel** : dépendance à la pile managée des fournisseurs (Netlify, Supabase) dont l'état n'a pas été confirmé par leurs avis.
- **Risque connexe plus réel** : les 34 alertes Dependabot actives sur `main` (2 critical/17 high, cf. CLAUDE.md) sont sans rapport avec PHP2Shell mais représentent la vraie surface Node à traiter.

## 6. Plan de correction priorisé (aucune action lancée, validation du responsable technique requise)

| Prio | Action | Prérequis | Test | Risque | Retour arrière |
|---|---|---|---|---|---|
| P1 | Lire les avis Netlify et Supabase sur PHP2Shell, consigner la preuve éditeur ici | aucun | n/a | nul | n/a |
| P1 | Consulter les logs Netlify 20–22/10 (requêtes multipart, erreurs mémoire, `*.php`) | accès dashboard (Bryan) | recherche par motif | nul | n/a |
| P2 | Lancer `php -v` sur le poste dev pour clore le point hygiène | terminal Bryan | sortie de commande | nul | n/a |
| P2 | Si Cloudflare est actif : activer la règle WAF managée PHP2Shell si Cloudflare en propose une | Cloudflare configuré | requête de test légitime | faux positifs WAF | désactiver la règle |
| P3 | Traiter les alertes Dependabot (chantier dédié déjà identifié) | PR + CI `build-and-typecheck` | build + tsc | régression de dépendance | revert de la PR |

Aucun correctif de code, de configuration ou de dépendance n'est nécessaire au titre de PHP2Shell.

## 7. Reproductibilité

Commandes : `git ls-files | grep -i -E '\.(php|phtml|phar)$|dockerfile|docker-compose|composer|\.htaccess|php\.ini'` ; lecture de `netlify.toml`, `.github/workflows/ci.yml`, `package.json` ; recherche de fichiers `*.php` dans `node_modules` ; liste `supabase/functions`. Deux recherches globales par `Glob` ont expiré (taille de `node_modules`) et ont été remplacées par les commandes ci-dessus.
