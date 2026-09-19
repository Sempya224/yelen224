# Yelen — Protection Auth (refonte opérationnelle + 2 correctifs réels)

Chantier "Protection Auth", **03/09/2026** (décision CEO), documenté a
posteriori le 06/09/2026 — code déjà écrit mais **jamais commité**, absent
de `CLAUDE.md` et de `docs/` jusqu'à cette fiche.

**Distinct de deux autres sujets sécurité admin à ne jamais confondre** :
- **Admin Entry Security V2** (`docs/security/YELEN_ADMIN_ENTRY_V2_DECISION.md`)
  — WebAuthn pour atteindre `/admin/login` (obscurcissement d'URL).
- **2FA/MFA du compte admin** (`docs/security/YELEN_SECURITY_MASTER.md`,
  DEC-2026-08-13-03) — authentifier un admin déjà identifié.

Ce chantier-ci gère le **moteur anti-abus** appliqué aux connexions
citoyen/institution/admin (`lib/security/authSecurity.ts`, brief CEO du
28/08/2026, schéma `20260828000004_auth_security.sql`) — ni son
authentification, ni son entrée. Le module lui-même (seuils, escalade,
`support_only`) n'a pas encore de fiche dédiée dans `docs/` ; cette page ne
documente que la **refonte opérationnelle du 03/09** (écran admin +
2 correctifs réels), pas le moteur d'origine du 28/08 dans son ensemble.

## 1. Le vrai bug corrigé — tentatives réussies comptées comme des échecs

**Avant ce correctif** : `enregistrerTentative()` incrémentait
`attempts_in_window` sur **toute** tentative, y compris un succès. Le flux
de connexion citoyen normal fait **2 appels** par connexion réussie
(`lookup` → outcome `trouve`, puis `verify` → outcome `code_correct`). Deux
connexions légitimes en 15 minutes suffisaient donc à atteindre
`SEUIL_BLOCAGE` (= `SEUIL_WARNING + 1` = 4) et à bloquer un citoyen
parfaitement légitime dès sa **3ᵉ connexion correcte** de la fenêtre.

**Correctif** (`lib/security/authSecurity.ts`) : un ensemble
`OUTCOMES_SUCCES` (`trouve`, `code_correct`, `compte_cree`,
`demande_creee`, `code_envoye`, `verification_ok`) fait basculer
`enregistrerTentative()` vers une nouvelle fonction
`reinitialiserApresSucces()` au lieu d'`incrementerEtEvaluer()` : remet
`attempts_in_window` à 0 et `state` à `normal`, **sans jamais toucher
`block_cycles_24h`** (l'historique d'abus sur 24h doit survivre à un succès
isolé au milieu d'une vague d'attaque — décision explicite, pas un oubli).
Pratique alignée sur NIST 800-63B / Google-GitHub : seuls les **échecs**
comptent vers l'escalade.

**Discipline fail-secure explicite** : tout `outcome` absent de
`OUTCOMES_SUCCES` reste classé échec par défaut — y compris pour des
catégories d'endpoint pas encore auditées. La liste a été construite par
grep exhaustif de tous les appelants réels de
`enregistrerTentative`/`enregistrerTentativeAdmin`/
`enregistrerTentativeAdminEntry` du dépôt, pas devinée.

## 2. Correctif TOTP — tolérance d'horloge

`app/api/admin/auth/2fa/verify/route.ts` et
`app/api/admin/auth/login/route.ts` : `verify()`/`verifyTotp()` appelés
désormais avec `epochTolerance: 30` (absent auparavant). Corrige les rejets
de code TOTP valides causés par un décalage d'horloge léger entre le
serveur et l'appareil de l'admin — sans changement du secret ni de la
fenêtre de code affichée à l'utilisateur.

## 3. Nouveau signal d'audit — `admin_maintain`

**Constat avant ce chantier** : seul un **déblocage** produisait un
événement dans `auth_security_events`. Un agent qui ouvrait un dossier de
protection et décidait de **ne rien changer** ne laissait aucune preuve
d'avoir examiné le cas.

Migration `20260903000002_auth_security_admin_maintain.sql` : élargit le
`CHECK` sur `event_type` pour accepter `'admin_maintain'`, symétrique de
`'admin_unblock'` déjà existant. **Aucun changement au moteur anti-abus
lui-même** — `POST /api/admin/auth-security/maintenir` (nouvelle route)
n'écrit **jamais** dans `auth_device_security`/`auth_ip_security`/
`auth_admin_device_security`/`auth_admin_ip_security` : il relit l'état
courant (`state`) pour le tracer tel quel dans l'événement, sans le
modifier. La protection reste exactement ce qu'elle était avant la
décision — seul un événement d'audit est ajouté.

## 4. Écran admin — refonte de `/admin/protection-auth`

Objectif du brief : que l'agent **comprenne** une protection (pourquoi elle
existe, ce qui s'est passé, si le risque est toujours présent) avant de
**décider** — Débloquer ou Maintenir — sans changer d'écran ni deviner.

- **Distinction "actionnable" vs "informatif"** : seuls `state='blocked'`
  non expiré et `state='support_only'` bloquent réellement une
  authentification (`estActionnable()`) — un `warning` (jamais bloquant à
  l'entrée) ou un `blocked` déjà expiré (`blocked_until` dépassé, mais pas
  encore remis à `normal` par le moteur faute d'une nouvelle tentative
  réelle) sont affichés séparément, non actionnables. Corrige un vrai
  défaut de lecture relevé par Bryan le 03/09/2026 : sans cette
  distinction, l'agent traitait des blocages déjà résolus par le temps
  comme s'ils étaient encore actifs.
- **Dossier détaillé** (`SlidePanel`, même composant que le reste de
  l'admin — jamais un accordéon inventé pour cette seule page) : motif de
  blocage réel (`blocked_reason`), événement déclencheur (1ʳᵉ transition
  réelle vers `blocked`/`support_only` dans la chronologie, calculée
  mécaniquement, jamais supposée), activité récente (tentatives réelles),
  historique des décisions administratives passées sur ce scope précis.
- **Nouvelle route** `GET /api/admin/auth-security/historique?scope=...&value=...`
  — chronologie complète d'UN device/IP (la liste principale de
  `/api/admin/auth-security` ne renvoie que les 50 derniers événements tous
  scopes confondus, insuffisant pour un dossier individuel). Aucune
  nouvelle donnée : mêmes tables, requête filtrée + jointure du nom de
  l'admin auteur d'une décision.
- **Réauthentification pour "Débloquer"** : `verifyRecentReauth`
  (mécanisme déjà construit, Mission Hardening Admin) n'avait **aucun point
  d'entrée UI dans tout l'admin** avant ce chantier — un admin fraîchement
  reconnecté n'a pas de `reauth_at` (seul `POST /api/admin/auth/reauth` le
  pose), donc recevait `REAUTH_REQUIRED` indéfiniment. **Bug réel trouvé
  par Bryan le 03/09/2026** ("je viens de me reconnecter" ≠
  réauthentification). Corrigé côté UI : le même `ConfirmModal` bascule en
  formulaire mot de passe (+TOTP si actif), puis rejoue automatiquement
  l'action d'origine une fois la réauth confirmée.
- Toasts éphémères (4s) remplacent un ancien bandeau fixe qui restait
  affiché indéfiniment (retour Bryan 03/09/2026).

## 5. Fichiers

- `lib/security/authSecurity.ts` — `OUTCOMES_SUCCES`,
  `reinitialiserApresSucces()`, branchement dans `enregistrerTentative()`.
- `app/api/admin/auth/2fa/verify/route.ts`,
  `app/api/admin/auth/login/route.ts` — `epochTolerance: 30`.
- `app/api/admin/auth-security/route.ts` — colonnes étendues
  (`first_seen_at`/`attempts_in_window`/`window_started_at`, existaient déjà
  en base depuis `20260828000004` mais jamais remontées à l'admin) +
  `admin_maintain` ajouté au filtre d'événements + jointure `admin_users(nom)`.
- `app/api/admin/auth-security/unblock/route.ts` — `resulting_state:'normal'`
  explicite sur l'événement de déblocage.
- `app/api/admin/auth-security/maintenir/route.ts` — nouvelle route (POST).
- `app/api/admin/auth-security/historique/route.ts` — nouvelle route (GET).
- `app/admin/protection-auth/page.tsx` — écran refondu (nav "Protection
  Auth", `app/admin/layout.tsx:66`, réservé `super_admin` seul).
- Migration `20260903000002_auth_security_admin_maintain.sql`.

Permissions RBAC (`lib/adminAuth.ts`) : `auth_security.read`/
`auth_security.manage`, **`super_admin` uniquement** pour les deux —
inchangé par ce chantier, déjà en place depuis le 28/08.

## 6. État réel / reste à faire

- **Code complet, migration écrite, jamais exécutée en base ni commitée.**
- Aucun test réel documenté (ni SQL, ni navigateur) sur les 2 correctifs de
  sécurité (succès comptés à tort, TOTP `epochTolerance`) — à vérifier en
  priorité vu leur impact direct sur des citoyens/admins légitimes
  aujourd'hui bloqués à tort en production tant que ce correctif n'est pas
  déployé.
- Le moteur `authSecurity.ts` d'origine (28/08/2026) n'a pas de fiche
  `docs/` dédiée — seule cette refonte du 03/09 est couverte ici. À
  combler séparément si un futur chantier y revient.
