# Yelen Dev — Portail développeur : architecture produit & sécurité

Démarré le 19/10/2026, juste après la clôture du chantier "Réservation
externe invité" (E0, voir `YELEN_BOOKING_EXTERNAL_INTEGRATION_PHASE0.md`
et `YELEN_BOOKING_EXTERNAL_ADR_E0_INVITE.md`). **Mission d'analyse
uniquement — aucun code écrit, aucune migration créée, aucune route
ajoutée, aucune configuration DNS/domaine modifiée.** Même discipline que
le chantier précédent : pas de code avant validation de l'architecture,
pas de fonctionnalité documentée publiquement avant qu'elle existe
réellement.

## Pourquoi ce chantier

Yelen Dev n'est pas une page marketing supplémentaire — c'est un produit
à part entière : une documentation publique (sans compte) pour que des
organisations partenaires comprennent le parcours de réservation Yelen,
et une console institutionnelle privée pour que les établissements
contrôlent leur propre intégration externe. Relié au chantier Phase
0/E0 : Yelen Dev est le point d'entrée humain vers le Niveau 1 (lien de
réservation direct) décrit là-bas, et deviendra le point d'entrée des
niveaux suivants (embed, API, webhooks) **uniquement s'ils sont
réellement livrés** — jamais documentés par anticipation.

## 1. Architecture recommandée

```
Dashboard institution Yelen224
  └─ Bouton « Développeurs » → nouvel onglet
       ├─ Yelen Dev — Documentation (publique, sous-domaine dédié)
       │    Guides, démarrage, sécurité, FAQ, changelog, statut, conditions
       │    Aucun compte institution requis
       └─ Yelen Dev — Console (privée, domaine principal)
            Activation, domaines autorisés, liens de réservation,
            et plus tard clés API/webhooks
            Session institution existante + autorisation propriétaire

Socle de sécurité partagé : autorisation serveur, RBAC, journal
d'activité, validation des domaines, séparation stricte entre contenu
public et données institutionnelles.
```

**Emplacement confirmé (audit du 19/10/2026)** : le dashboard institution
(`app/[slug]/[id]/layout.tsx`) a déjà un emplacement conçu exactement
pour ce type d'entrée — le tiroir **"Yelen Business"**
(`YELEN_BUSINESS_SECTIONS`), ouvert depuis le popover "Management" du
header (icône avatar), volontairement **séparé de la sidebar
principale** ("menu principal trop chargé", commentaire du 17/09/2026
dans le code). Organisé en 4 sections (Compte, Finance, Documents,
Assistance), régit la relation Yelen↔institution (compte/contrat,
forfait, frais, documents Yelen, support) plutôt que les opérations du
jour-le-jour — c'est exactement la nature du bouton "Développeurs". La
majorité de ces écrans sont aujourd'hui des stubs (`YelenBusinessStub`,
"aucune donnée/route réelle encore") — ajouter une nouvelle entrée y est
peu invasif, cohérent avec le pattern existant. **Recommandation** :
ajouter "Développeurs" comme nouvelle section ou sous `Assistance`
plutôt que de créer un nouveau point d'entrée dans la sidebar
principale.

Les deux zones partagent une identité visuelle et une navigation
cohérentes, **mais pas une frontière de confiance**. La documentation
publique ne doit jamais recevoir de secret de session institutionnel. Un
sous-domaine ne constitue pas une isolation totale à lui seul — il faut
aussi vérifier cookies, en-têtes, et déploiement (voir § 4, déjà fait en
partie).

**Nuance importante (retour CEO, 19/10/2026)** : le cookie host-only
(§ 4) protège contre la **lecture** de la session par un script sur
`dev.yelen224.com` — il ne protège pas automatiquement contre son
**attachement** par le navigateur. `dev.yelen224.com` et
`yelen224.com` sont *same-site* entre eux (même domaine enregistrable),
donc `SameSite=Strict` ne bloque pas une requête same-site de l'un vers
l'autre. Ce qui protège réellement aujourd'hui, de façon incidente :
**zéro CORS configuré nulle part dans le projet** (vérifié,
`Access-Control-Allow-Origin` absent de tout le code). Une requête JSON
(`Content-Type: application/json`, le pattern déjà utilisé partout dans
ce projet) déclenche un preflight qui échoue sans en-tête CORS explicite
— la requête réelle n'est donc jamais envoyée. Mais une route qui
accepterait une requête "simple" (GET avec effet de bord, POST
`form-urlencoded`) ne serait pas protégée par ce mécanisme. **Pas un
risque actif aujourd'hui** (`dev.yelen224.com` n'existe pas encore) —
mais une contrainte à respecter explicitement dans la spec des routes
console (§ 3).

**Complété (retour CEO, 19/10/2026)** : l'absence de CORS est une
protection fragile — elle disparaît le jour où quelqu'un ajoute un en-tête
CORS "pour que ça marche". Trois règles à écrire dans la spec des routes
console, pas seulement "exiger JSON" :
1. **Aucun effet de bord sur un `GET`** — un GET reste attachable même
   sans CORS, la règle JSON ne le couvre pas.
2. **Défense explicite et indépendante côté serveur** : vérifier
   l'en-tête `Origin` (ou `Sec-Fetch-Site`) et rejeter ce qui ne vient
   pas de `yelen224.com`. Vérifié : **aucune route du projet ne fait ce
   contrôle aujourd'hui** (zéro occurrence de `Sec-Fetch-Site`/lecture
   d'`Origin` côté serveur) — nouveau pattern à introduire
   spécifiquement pour Yelen Dev, pas une réutilisation de l'existant.
   **Précision (retour CEO, 19/10/2026)** : la règle `Sec-Fetch-Site:
   same-origin` ne s'applique **qu'aux mutations et aux appels de
   données** (fetch/XHR), jamais au **chargement de page** de la
   console elle-même — une navigation directe (clic sur "Développeurs"
   depuis le dashboard, lien depuis `dev.yelen224.com`, saisie directe de
   l'URL) envoie `same-site`, `same-origin` ou `none` selon le cas,
   jamais garanti `same-origin`. Appliquer la règle au chargement de page
   bloquerait l'ouverture légitime de la console. Prévoir aussi un repli
   sur la vérification d'`Origin` pour les navigateurs qui n'envoient pas
   `Sec-Fetch-Site`.
3. **Test de régression** : un test qui échoue si un en-tête CORS
   apparaît un jour sur une route console.

## 1bis. Lien documentation → console — risque non couvert ajouté
(retour CEO, 19/10/2026)

Si la documentation publique (`dev.yelen224.com`) contient un lien
"Accéder à la console" vers `yelen224.com/dev/console` :
- `rel="noopener"` obligatoire sur tout lien `target="_blank"` (sinon la
  page ouverte peut manipuler `window.opener` et rediriger l'onglet
  d'origine — reverse tabnabbing).
- Aucun paramètre sensible dans l'URL (cohérent avec la règle déjà
  posée § 3 : l'institution active vient de la session, jamais d'un
  paramètre de requête).
- **Jamais de formulaire de connexion sur `dev.`** — une doc publique
  qui affiche un écran de connexion ressemblant à celui de la console
  est une cible de phishing. La connexion reste exclusivement sur le
  domaine principal. Cohérent avec la règle déjà posée § 2 ("aucun
  compte institution requis" sur la doc) — à traiter comme une
  interdiction explicite, pas seulement une absence de besoin.

## 2. Organisation du portail public (direction, pas un gabarit figé)

- **Accueil** — ce qu'une organisation peut intégrer à Yelen224
  aujourd'hui, les cas d'usage réels, les niveaux d'intégration et le
  **statut réel** de chacun (ne jamais présenter "à venir" comme
  disponible).
- **Documentation — Démarrer** — le Niveau 1 en premier et seul
  documenté pour l'instant : partager un lien de réservation Yelen224,
  le parcours réel vécu par le visiteur, les prérequis, les limites.
- **Évolutions — Changelog et roadmap publique** — le changelog ne liste
  que ce qui est réellement livré. Embed, API, webhooks portent la
  mention "À venir", sans date promise ni exemple laissant croire qu'ils
  sont opérationnels.
- **Confiance — Sécurité, support, conditions** — signalement responsable
  d'une vulnérabilité, canal développeur distinct du support général,
  lien vers l'espace légal existant (`app/(legal)/`).

## 3. Architecture de la console institutionnelle

La console n'est pas un second dashboard institution — c'est un espace
spécialisé dans la relation entre l'établissement et les intégrations
externes.

**Sections envisagées** (proposition UX, pas un écran existant) :
intégration externe (activation explicite par établissement), domaines
autorisés (pour les futurs modes d'intégration), liens de réservation
(consultation/copie des liens existants), historique des actions
(`journal_activite`).

### Règles à fixer dès maintenant

- L'institution active est déterminée par la **session et les
  autorisations serveur**, jamais par un `institution_id` librement
  choisi dans une requête.
- Chaque opération de configuration est vérifiée côté serveur avec le
  RBAC existant (`can()`, `institution_membres_roles_rbac`) — le rôle
  propriétaire est le candidat naturel pour activer l'intégration et
  gérer les domaines.
- Chaque activation, désactivation, modification sensible est tracée
  dans `journal_activite`.
- L'activation est explicite et révocable — une intégration désactivée
  ne doit plus jamais pouvoir créer de réservation externe.
- Les domaines autorisés ne sont **pas** des identifiants
  d'authentification — ils ne remplacent ni les contrôles d'accès ni la
  validation des réservations.
- **Aucune donnée de réservation dans cette première version de la
  console** — uniquement de la configuration (activation, domaines,
  liens). Limite directement ce qu'une faille éventuelle pourrait
  exposer.
- Distinguer les pages du portail Yelen Dev des futures pages
  éventuellement embarquées sur un site partenaire : la politique CSP de
  la documentation publique doit rester indépendante. Pour un futur
  contenu embarqué, les origines autorisées devront être validées et
  injectées dans la politique propre à la ressource concernée — jamais
  ajoutées globalement au site principal. **Précision (retour CEO,
  19/10/2026)** : la CSP de la doc devrait être **enforcée dès le
  départ**, pas en Report-Only comme le reste du site actuellement — la
  doc est statique, une CSP stricte y est facile à tenir, et c'est
  l'occasion de ne pas hériter de la dette de `Content-Security-Policy-Report-Only`
  déjà présente sur le site principal (`proxy.ts`).

## 4. Hébergement et frontières de sécurité

| Élément | Décision proposée | Statut vérifié (19/10/2026) |
|---|---|---|
| Documentation | `dev.yelen224.com` | Domaine `yelen224.com` **disponible au moment de la vérification** (19/10/2026) — enregistrement planifié chez Cloudflare le 21/10/2026, à reconfirmer à l'achat, pas un fait acquis |
| Console | `yelen224.com/dev/console` | Dépend du même enregistrement |
| Ouverture | Nouvel onglet depuis le dashboard institution | Pas encore implémenté |
| Session console | Cookie institution existant, sans partage volontaire avec le sous-domaine | **CONFIRMÉ, élargi (retour CEO, 19/10/2026)** — vérification étendue aux **10 cookies de session de tout le projet** (citoyen, institution ×8, admin ×2, employé, device-id, geo-bypass) : aucun n'a d'attribut `Domain`, tous host-only par défaut, même exposition et même protection partout, pas seulement institution |
| Accès console | Authentification existante + autorisation sur chaque opération | RBAC/`journal_activite` confirmés matures et réutilisables tels quels |
| Documentation | Aucun secret institutionnel, aucune donnée privée | À appliquer à la conception du contenu, rien à vérifier en code encore |
| Protection contre l'intégration en iframe | Politique CSP adaptée à chaque zone | **CONFIRMÉ** — `proxy.ts` (edge middleware, voir note ci-dessous) pose déjà `X-Frame-Options: DENY`, `Content-Security-Policy-Report-Only`, HSTS, `Permissions-Policy` sur tout le site. Report-only ≠ bloquant — à durcir en `Content-Security-Policy` enforcée si Yelen Dev l'exige, pas encore fait |
| Journalisation | `journal_activite` pour les actions sensibles | Confirmé mature |

**Correction de parcours (19/10/2026)** : une hypothèse initiale pensait
le fichier edge middleware disparu/mal nommé (`middleware.ts` attendu,
trouvé sous `proxy.ts`). Vérifié par test réel (`npm run dev`) : ce
projet tourne sur Next.js `16.4.2`, où **`proxy.ts` est le nom correct**
(convention renommée par Next.js lui-même, `middleware.ts` y est
déprécié et casse silencieusement). Rien n'était cassé — voir mémoire
`project-proxy-ts-not-middleware`. Point important pour Yelen Dev : ce
fichier est donc la bonne base à étendre pour toute politique CSP future
spécifique au sous-domaine `dev.yelen224.com`, pas un fichier à
recréer.

**`helpcenter.yelen224.com`** — mentionné lors de la discussion du
domaine. **Clarifié par Bryan le 19/10/2026 (après une première réponse
contraire) : c'est bien une vraie décision de migrer le Centre d'aide
existant** (`YELEN_PUBLIC_HELP_CENTER_*`/`YELEN_PROVIDER_HELP_CENTER_*`,
aujourd'hui in-app) **vers son propre sous-domaine — mais aucune action
à ce stade**, simple décision actée pour plus tard, pas un chantier
ouvert. Même discipline que le reste : à spécifier/documenter en détail
seulement quand ce chantier sera effectivement lancé, pas maintenant.
**Confirmé par Bryan le 19/10/2026 : l'espace légal (`app/(legal)/`,
CGU/confidentialité/mentions légales) suit le même sort** — migration
vers son propre sous-domaine décidée, aucune action à ce stade, même
discipline que le Centre d'aide (décision notée pour plus tard, pas un
chantier ouvert). **Si/quand ce chantier démarre** : prévoir des
redirections permanentes — ces pages sont déjà citées ailleurs (contrats,
emails), une migration sans redirection casserait des liens légaux
publiés.

**Cloudflare DNS-only vs proxy — à décider avant l'enregistrement du
21/10, vérifié techniquement (19/10/2026)** : `lib/edgeSecurity.ts::extraireIpClient()`
lit `x-nf-client-connection-ip` (en-tête propre à Netlify) **en
priorité**, avec repli sur `x-forwarded-for` seulement si le premier est
vide. Si le proxy Cloudflare (nuage orange) est activé devant Netlify,
Netlify verra l'IP de l'edge Cloudflare comme connexion directe —
`x-nf-client-connection-ip` renverrait alors systématiquement une IP
Cloudflare, jamais celle du vrai visiteur, et le code ne retomberait
jamais sur `x-forwarded-for` puisque la première valeur ne serait pas
vide. **Conclusion vérifiée, pas une simple prudence** : activer le
proxy Cloudflare casserait silencieusement la détection d'IP de tout le
rate limiting edge actuel (`lib/edgeSecurity.ts`), sauf correctif
préalable pour prioriser `CF-Connecting-IP` quand il est présent. À
corriger **avant** d'activer le proxy, pas après.

**Décision actée (retour CEO, 19/10/2026), pour ne pas trancher sous
pression du 21/10** : **le lancement se fait en DNS seul** (nuage gris,
pas orange). Le passage au proxy Cloudflare est un chantier séparé, avec
son propre correctif (`extraireIpClient()`) et son propre test — jamais
activé "en même temps" que l'achat du domaine.

**Signalement de vulnérabilité** — à prévoir avec l'achat du domaine :
une adresse `security@yelen224.com` et un fichier
`/.well-known/security.txt`. Non vérifié dans le code (n'existe pas
aujourd'hui, cohérent avec l'absence de domaine propre).

**Sous-domaine takeover (ajouté, retour CEO 19/10/2026)** — un
enregistrement DNS `dev.` qui pointe vers un service ensuite abandonné
(ex. un projet Netlify supprimé) peut être récupéré par un tiers. Règle à
tenir : **supprimer l'enregistrement DNS avant de supprimer le projet
associé**, et auditer les enregistrements à chaque changement
d'hébergement. S'appliquera aussi à `helpcenter.` et au sous-domaine
légal quand ces chantiers démarreront.

**Préfixe `__Host-` sur les cookies de session (ajouté, retour CEO
19/10/2026)** — renommer `yelen224_institution_session` (et les 9 autres
cookies de session identifiés ci-dessus) en `__Host-yelen224_institution_session`
ferait **imposer par le navigateur** ce qui n'est aujourd'hui qu'un
comportement par défaut : `Secure`, `Path=/`, et refus de tout `Domain`
— empêche aussi un sous-domaine d'écraser le cookie (cookie tossing).
**Contrainte concrète vérifiée** : le préfixe `__Host-` exige `Secure`
sans exception — or tous les cookies du projet posent
`secure: process.env.NODE_ENV === "production"`, donc `false` en dev
local (`next dev` sans HTTPS). Ajouter le préfixe sans adresser ce point
casserait la connexion en développement local tant qu'aucun HTTPS local
n'est en place.

**Reclassé (retour CEO, 19/10/2026)** : pas une simple amélioration
"migration future" — **prérequis avant d'héberger quoi que ce soit de
tiers ou de contenu éditable sur un sous-domaine**. Sans `__Host-`,
n'importe quel script ou service sur *n'importe quel* sous-domaine de
`yelen224.com` peut poser un cookie `Domain=yelen224.com` du même nom
que le cookie de session (cookie tossing) — risque qui devient réel dès
que le **premier** sous-domaine est en ligne, pas seulement `dev.`. Pour
une doc statique entièrement sous contrôle propre (déploiement séparé,
§ 5 point 1), le risque reste faible au lancement — mais dès que
`helpcenter.`/légal ou tout service tiers rejoint l'infrastructure, le
préfixe devient bloquant, pas optionnel. **À planifier dans l'ADR avec
sa période de transition de sessions, avant d'ouvrir un sous-domaine à
du contenu éditable ou tiers — pas après.**

## 5. Décisions d'architecture encore ouvertes

Le périmètre général est assez clair pour avancer dans la conception.
Reste à trancher avant l'ADR final :

1. **Domaine et déploiement** — **recommandation révisée (retour CEO,
   19/10/2026)**, inverse de la version initiale de ce document : pour
   une doc publique statique, un **déploiement séparé** est souvent plus
   simple et plus sûr qu'un routage par hôte dans l'app principale —
   aucun accès aux secrets, aucune dépendance à `proxy.ts`, déploiement
   indépendant. Le routage par hôte dans l'app Next.js principale n'a de
   sens que s'il y a une raison précise de partager des composants avec
   le reste du produit. Défaut proposé : **doc statique sur déploiement
   séparé, console dans l'app principale** (`yelen224.com/dev/console`).
   **Complément requis (retour CEO, 19/10/2026) avant que cette décision
   soit utilisable** : préciser *où* exactement (autre projet Netlify ?
   autre fournisseur ?) et *qui* y a accès — un déploiement séparé avec
   les mêmes accès administrateur que l'app principale n'isole pas grand
   chose. Non tranché par Bryan.
2. **Droits de la console** — recommandation : le rôle **propriétaire**
   modifie, un second rôle (ex. admin institution) consulte en lecture
   seule, rien d'autre au départ. Non tranché par Bryan.
3. **[PRIORITAIRE — conditionne le schéma] Consentement et révocation** —
   recommandation : activation explicite avec acceptation de conditions
   développeur **versionnées et horodatées** ; révocation **immédiate**,
   côté serveur, **vérifiée à chaque réservation externe** (pas
   seulement à l'activation). Cohérent avec la question 2 du Phase 0 du
   chantier booking externe, jamais tranchée là-bas non plus. Non
   tranché par Bryan — à confirmer en priorité.
4. **[PRIORITAIRE — conditionne le schéma] Domaines autorisés** —
   recommandation : **liste par institution**, jamais un domaine
   générique unique — c'est la seule façon de borner un futur
   `frame-ancestors` à ce que l'institution a réellement choisi. Même
   question ouverte que Phase 0, question 3. Non tranché par Bryan — à
   confirmer en priorité.
5. **Support développeur** — recommandation : **canal séparé dès le
   départ** (sinon les demandes techniques noient le support
   institution existant) — réutiliser l'outil de tickets existant
   (`YELEN_SUPPORT_TICKETING.md`) avec une catégorie dédiée plutôt qu'un
   système neuf. Non tranché par Bryan.

**Toutes les recommandations ci-dessus sont des propositions, pas des
décisions actées** — à valider ou corriger par Bryan avant l'ADR.

## 6. Ordre de travail recommandé

1. Architecture fonctionnelle — pages, rôles, parcours, états
   d'activation. *(ce document, en cours)*
2. Audit technique en lecture seule — routage, en-têtes CSP, cookie de
   session, RBAC, journal d'activité existants. *(démarré 19/10/2026,
   résultats intégrés au § 4 ci-dessus — RBAC/`journal_activite`/cookie
   confirmés ; domaine confirmé planifié, pas encore live)*
3. ADR Yelen Dev — décisions validées, alternatives rejetées, points
   restant à confirmer. *(pas commencé — dépend de la clôture du § 5)*
   **Condition ajoutée (retour CEO, 19/10/2026) : l'ADR se ferme APRÈS
   l'achat du domaine (21/10/2026), pas avant** — plusieurs décisions
   (CSP, choix de déploiement, Cloudflare DNS-only vs proxy) dépendent de
   la configuration DNS réelle, pas seulement de l'intention.
4. Spécification UX — écrans du portail public et de la console, avant
   toute modification de code. *(pas commencé)*
5. Plan de livraison — lots isolés, critères de sécurité, tests,
   rollback, observabilité. *(pas commencé)*

**À ce stade, aucune migration, route, page ou configuration n'est
créée.**

## Prochaine étape

**Étape 2 (audit technique lecture seule) close le 19/10/2026** :
- Tous les `Set-Cookie` de l'app vérifiés (§ 4) — 10 cookies, tous
  host-only.
- Emplacement du bouton "Développeurs" confirmé (§ 1) — tiroir "Yelen
  Business" existant, pas la sidebar principale.
- `institutions.slug` (migration `20260805000010`) : identifiant
  URL-friendly unique par institution (`CHECK` kebab-case,
  `UNIQUE`), **déjà utilisé comme segment de chemin** (`/clock/{slug}`,
  `[slug]/[id]`), **jamais comme sous-domaine** — aucun conflit avec le
  plan `dev.yelen224.com`. Réutilisable comme clé naturelle pour la
  future décision "domaines autorisés par institution" (§ 5, point 4)
  plutôt que d'inventer un nouvel identifiant.

**Pas de raison de rouvrir l'analyse d'architecture avant l'achat du
domaine (21/10/2026).** L'étape 3 (ADR Yelen Dev) est la prochaine
étape réelle, conditionnée par cet achat.
