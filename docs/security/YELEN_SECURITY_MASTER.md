# YELEN — SECURITY, RELIABILITY & PRODUCTION READINESS MASTER PLAN

## Mission permanente

Yelen doit être construit comme une plateforme durable, sécurisée, résiliente et évolutive.

Nous ne cherchons pas à construire un système « impossible à pirater ».
Un tel système n'existe pas.

Notre objectif est différent :

> Si une attaque réussit à pénétrer une partie du système, elle ne doit pas permettre de compromettre l'ensemble de Yelen.

Nous adoptons donc le principe :

**Assume Breach**

et le cycle :

**Govern → Identify → Protect → Detect → Respond → Recover → Learn → Improve**

Ce cadre doit rester actif pendant toute la durée du développement et de l'exploitation de Yelen.

---

## 00 — RÈGLE ABSOLUE

**SECURITY FIRST**

Aucune évolution ne doit introduire volontairement une faiblesse de sécurité pour gagner du temps.

Interdictions :
- secrets dans Git ;
- clés API dans le code ;
- credentials dans les fichiers publics ;
- données sensibles dans les logs ;
- bypass d'autorisation pour faciliter le développement ;
- comptes administrateurs partagés ;
- accès production permanent pour les développeurs ;
- désactivation temporaire d'une protection sans ticket/documentation ;
- données de production copiées librement dans les environnements de développement.

Tout raccourci de sécurité doit être considéré comme une dette critique.

---

## 01 — SECURITY GOVERNANCE

Créer dans le projet :

`/docs/security/`

avec un fichier maître :

`YELEN_SECURITY_MASTER.md`

Ce document devient la référence centrale.

Il doit contenir :
- niveau de risque ;
- exigences ;
- décisions ;
- exceptions ;
- contrôles ;
- résultats des audits ;
- incidents ;
- dates de vérification ;
- responsable ;
- statut.

Chaque exigence reçoit :

`ID → Description → Risque → Contrôle → Statut → Preuve → Date de vérification`

Statuts :
- 🔴 NOT STARTED
- 🟠 IN PROGRESS
- 🟡 NEEDS REVIEW
- 🟢 VERIFIED
- ⚫ EXCEPTION APPROVED

---

## 02 — ASSET & ARCHITECTURE INVENTORY

Créer une cartographie complète de Yelen.

Identifier :
- frontend ;
- PWA ;
- future native app ;
- Netlify ;
- Supabase ;
- PostgreSQL ;
- Auth ;
- Storage ;
- APIs ;
- Edge Functions ;
- services tiers ;
- domaines ;
- DNS ;
- emails ;
- analytics ;
- notifications ;
- repositories ;
- CI/CD ;
- secrets ;
- environnements.

Aucune ressource inconnue ne doit exister en production.

C'est particulièrement important pour les API : OWASP identifie Improper Inventory Management comme un risque majeur.

---

## 03 — DATA CLASSIFICATION

Classer toutes les données Yelen.

Exemple :

**Public**
Informations publiques d'établissement/offre.

**Internal**
Informations internes de fonctionnement.

**Confidential**
Nom, téléphone, informations professionnelles.

**Highly Sensitive**
Documents d'identité, informations personnelles sensibles, données d'authentification, etc.

Pour chaque catégorie :
- qui peut lire ;
- qui peut écrire ;
- où elle est stockée ;
- combien de temps elle est conservée ;
- comment elle est chiffrée ;
- comment elle est supprimée ;
- comment elle est auditée.

**Principe**

Ne jamais collecter ou conserver une donnée uniquement parce qu'il est techniquement possible de le faire.

---

## 04 — IDENTITY & AUTHENTICATION

Audit complet de :
- inscription ;
- connexion ;
- récupération de compte ;
- changement de mot de passe ;
- sessions ;
- refresh tokens ;
- expiration ;
- logout ;
- appareils ;
- MFA ;
- vérification email ;
- OTP ;
- comptes responsables ;
- comptes administrateurs.

Contrôler :
- brute force ;
- credential stuffing ;
- session hijacking ;
- token theft ;
- fixation de session ;
- récupération de compte frauduleuse.

Supabase recommande notamment MFA, confirmations email, protections Auth et gestion correcte des JWT/limites.

---

## 05 — AUTHORIZATION / RBAC / ABAC

Priorité critique.

Construire une matrice :

| Role | Resource | Read | Create | Update | Delete | Approve |
|---|---|---|---|---|---|---|
| Citizen | X | ✓ | ✓ | ✓ | — | — |
| Employee | X | ✓ | — | — | — | — |
| Responsable | X | ✓ | ✓ | ✓ | ✓ | — |
| Admin | X | ✓ | ✓ | ✓ | ✓ | ✓ |

Mais ne jamais se contenter du frontend.

Chaque opération sensible doit être autorisée côté backend/database.

OWASP place notamment les failles d'autorisation d'objet et de fonction parmi les principaux risques API.

---

## 06 — SUPABASE DATABASE SECURITY

Audit complet de PostgreSQL/Supabase.

Vérifier :
- RLS activé sur toutes les tables exposées ;
- politiques RLS ;
- accès par organisation ;
- accès par utilisateur ;
- accès par rôle ;
- fonctions SQL ;
- permissions ;
- rôles PostgreSQL ;
- service role ;
- vues ;
- triggers ;
- extensions ;
- accès Storage ;
- logs ;
- migrations.

Supabase indique explicitement que les tables sans RLS correctement configuré peuvent permettre à des clients d'accéder ou modifier des données qu'ils ne devraient pas.

---

## 07 — MULTI-TENANCY

Yelen doit être capable de séparer strictement :

Entreprise A des Entreprise B

et :

Institution A des Institution B.

Un utilisateur ne doit jamais pouvoir modifier un `organization_id`, `user_id`, `employee_id`, etc. dans une requête pour obtenir les données d'un autre tenant.

Tester volontairement :

« Je suis entreprise A. Puis-je récupérer une donnée de l'entreprise B ? »

La réponse doit toujours être :

**NON.**

---

## 08 — API SECURITY

Audit selon OWASP API Security Top 10 :
- Broken Object Level Authorization ;
- Broken Authentication ;
- Broken Object Property Level Authorization ;
- Unrestricted Resource Consumption ;
- Broken Function Level Authorization ;
- Sensitive Business Flow abuse ;
- SSRF ;
- Security Misconfiguration ;
- Improper Inventory ;
- Unsafe Consumption of APIs.

Chaque endpoint doit avoir :

`owner + purpose + authentication + authorization + validation + rate limit + logging`

---

## 09 — INPUT / OUTPUT SECURITY

Toutes les données venant de l'utilisateur sont considérées comme non fiables.

Tester :
- SQL injection ;
- XSS ;
- HTML injection ;
- command injection ;
- path traversal ;
- SSRF ;
- malicious files ;
- oversized payload ;
- malformed JSON ;
- mass assignment ;
- unsafe redirects.

Ne jamais faire confiance au frontend pour valider une règle de sécurité.

---

## 10 — RATE LIMITING & ABUSE PREVENTION

Identifier les flux sensibles :
- login ;
- OTP ;
- inscription ;
- création de compte ;
- récupération de compte ;
- recherche ;
- commentaires ;
- publications ;
- offres ;
- demandes de partenariat ;
- upload ;
- clock-in ;
- clock-out.

Définir :

`normal → suspicious → blocked`

OWASP identifie notamment la consommation non maîtrisée des ressources et l'accès abusif aux flux métier sensibles comme des risques API.

---

## 11 — FILE & STORAGE SECURITY

Pour toutes les images/documents :
- type réel du fichier ;
- extension ;
- taille ;
- MIME ;
- antivirus/malware scanning selon criticité ;
- noms générés côté serveur ;
- permissions ;
- URLs signées ;
- expiration ;
- isolation par utilisateur/organisation.

Ne jamais considérer `.jpg` comme une preuve qu'un fichier est réellement une image.

---

## 12 — SECRETS MANAGEMENT

Aucun secret dans :
- Git ;
- frontend ;
- logs ;
- screenshots ;
- documentation publique ;
- messages ;
- variables exposées au navigateur.

Utiliser le mécanisme adapté au fournisseur pour les secrets serveur.

Rotation :
- API keys ;
- database credentials ;
- JWT secrets ;
- service credentials ;
- SMTP ;
- third-party integrations.

Et surtout : les secrets de production ne doivent jamais être identiques à ceux du développement.

---

## 13 — ENVIRONNEMENTS

Créer une séparation stricte :

`Development → Preview / Staging → Production`

Jamais : développement → directement production.

Les données doivent également être séparées.

---

## 14 — GIT & SUPPLY CHAIN

Mettre en place :
- branch protection ;
- pull requests ;
- reviewers ;
- secret scanning ;
- dependency scanning ;
- SAST ;
- SBOM ;
- lockfiles ;
- dépendances versionnées ;
- suppression des dépendances inutiles ;
- surveillance CVE ;
- provenance des builds.

NIST SSDF recommande d'intégrer les pratiques de sécurité directement dans le cycle de développement plutôt que de traiter la sécurité uniquement à la fin.

---

## 15 — CI/CD SECURITY

Pipeline cible :

`Developer → Pull Request → Code Review → Security Checks → Build → Tests → Staging → Approval → Production`

Aucun déploiement manuel non audité.

Prévoir rollback.

---

## 16 — NETLIFY SECURITY

Auditer :
- configuration domaine ;
- HTTPS ;
- headers ;
- CSP ;
- CORS ;
- redirects ;
- rewrites ;
- variables d'environnement ;
- previews ;
- deploy permissions ;
- branch protection ;
- logs ;
- domaine custom.

Le domaine Netlify actuel reste un environnement de développement/test, pas le domaine produit final.

---

## 17 — SUPABASE PRODUCTION HARDENING

Vérifier officiellement :
- RLS ;
- SSL enforcement ;
- Network Restrictions ;
- MFA ;
- organisation owners ;
- Auth configuration ;
- OTP expiration ;
- SMTP ;
- rate limits ;
- database security ;
- Storage policies ;
- Realtime authorization ;
- secrets ;
- backups ;
- migrations.

Supabase fournit précisément une checklist de passage en production couvrant ces domaines.

---

## 18 — BACKUPS

Définir RPO et RTO pour chaque système critique.

Exemple initial à définir après analyse :

| Système | RPO | RTO |
|---|---|---|
| Identity | à définir | à définir |
| Citizen | à définir | à définir |
| Enterprise | à définir | à définir |
| Clock-in | à définir | à définir |

Ne jamais inventer les valeurs uniquement pour remplir le tableau.

---

## 19 — RESTORE TEST

Un backup qui n'a jamais été restauré est une hypothèse.

Mettre en place :

`backup → restore → verification → report`

Tester régulièrement.

Vérifier :
- intégrité ;
- données ;
- permissions ;
- cohérence ;
- temps réel nécessaire ;
- réussite complète.

---

## 20 — DISASTER RECOVERY

Créer :

`DISASTER_RECOVERY_RUNBOOK.md`

Prévoir les scénarios :
- Supabase indisponible ;
- Netlify indisponible ;
- database corruption ;
- account compromise ;
- secret compromise ;
- ransomware ;
- DNS compromise ;
- third-party outage ;
- perte d'accès administrateur.

Pour chaque scénario :

`Detect → Contain → Recover → Verify → Communicate → Learn`

---

## 21 — OBSERVABILITY

Mettre en place :

**Logs**
Structurés.

**Metrics**
- latency ;
- traffic ;
- errors ;
- saturation.

**Traces**
Pour les parcours critiques.

**Alerts**
Uniquement les alertes actionnables.

Jamais de données personnelles sensibles dans les logs.

---

## 22 — SECURITY MONITORING

Détecter notamment :
- bruteforce ;
- login anormal ;
- création massive de comptes ;
- extraction massive ;
- comportement inhabituel ;
- privilèges modifiés ;
- accès administrateur inhabituel ;
- uploads suspects ;
- erreurs répétées ;
- activité automatisée.

---

## 23 — AUDIT TRAIL

Pour les actions sensibles :

`Who → What → When → Where → Result`

Exemples :
- Responsable A a ajouté employé B.
- Admin C a modifié une permission.
- Institution D a publié une offre.
- Admin E a suspendu un compte.

Les logs d'audit doivent eux-mêmes être protégés contre la modification non autorisée.

---

## 24 — ADMIN & PRIVILEGED ACCESS

Les comptes privilégiés doivent avoir :
- MFA ;
- permissions minimales ;
- sessions limitées ;
- audit ;
- accès production contrôlé ;
- séparation des rôles ;
- procédure d'urgence.

Créer un mécanisme break-glass documenté pour les situations critiques.

---

## 25 — PRIVACY & DATA GOVERNANCE

Créer :

`YELEN_DATA_GOVERNANCE.md`

Documenter :
- données collectées ;
- finalité ;
- base légale à déterminer avec conseil juridique ;
- conservation ;
- suppression ;
- export ;
- correction ;
- accès ;
- partage ;
- sous-traitants ;
- transferts internationaux.

Ne pas supposer automatiquement que le RGPD est la loi applicable à toute opération Yelen ; utiliser le RGPD comme référence de maturité, puis faire valider les obligations applicables à la Guinée et aux futurs marchés par un conseil juridique compétent.

---

## 26 — THIRD-PARTY SECURITY

Chaque service externe doit être inventorié :
- Supabase ;
- Netlify ;
- email ;
- analytics ;
- paiement ;
- maps ;
- notifications ;
- identity ;
- autres APIs.

Pour chacun :

`Données envoyées → pourquoi → où → combien de temps → sécurité → dépendance → plan B`

OWASP souligne que les APIs tierces peuvent devenir une voie d'attaque lorsqu'elles sont consommées sans validation et contrôles appropriés.

---

## 27 — PERFORMANCE & SCALABILITY

Ne pas décider arbitrairement : « Nous devons supporter 10 000 utilisateurs. »

Déterminer d'abord :
- utilisateurs attendus ;
- trafic ;
- pics ;
- requêtes/sec ;
- écritures ;
- lectures ;
- uploads ;
- événements ;
- capacité DB.

Puis :

`load test → stress test → soak test → capacity planning`

---

## 28 — RESILIENCE

Identifier tous les Single Points of Failure.

Pour chacun :
- Existe-t-il ?
- Quel impact ?
- Quelle mitigation ?
- Quel coût ?
- Quel niveau est nécessaire maintenant ?

Ne pas introduire une architecture distribuée simplement parce qu'elle paraît « enterprise ».

---

## 29 — MOBILE SECURITY

Lorsque Yelen native commencera :

Référentiel : OWASP MASVS / MASTG

Audit :
- stockage local ;
- tokens ;
- secrets ;
- biométrie ;
- permissions ;
- deep links ;
- WebViews ;
- certificate validation ;
- jailbreak/root ;
- reverse engineering ;
- screenshots ;
- notifications ;
- données offline.

Décider techniquement les protections après threat modeling.

---

## 30 — SECURITY TESTING

Avant production :

**SAST**
Analyse du code.

**DAST**
Analyse de l'application en fonctionnement.

**Dependency scanning**
Vulnérabilités des dépendances.

**Secret scanning**
Détection des secrets.

**API testing**
Tests OWASP.

**Pentest externe**
Effectué par une équipe indépendante.

---

## 31 — RED TEAM / ADVERSARIAL TESTING

À maturité suffisante :

Tester comme un attaquant.

Objectifs :
- Entrer.
- Escalader.
- Traverser les frontières.
- Exfiltrer.
- Persister.
- Être détecté.

Le but n'est pas uniquement de trouver une vulnérabilité.

Le but est de vérifier : Que se passe-t-il si quelqu'un réussit ?

---

## 32 — INCIDENT RESPONSE

Créer :

`INCIDENT_RESPONSE_PLAN.md`

Définir :
- Incident Commander ;
- Security Lead ;
- Engineering Lead ;
- communication ;
- juridique ;
- décision maker ;
- escalade.

Préparer des playbooks :
- account takeover ;
- database breach ;
- secret leak ;
- ransomware ;
- DDoS ;
- malicious employee ;
- supply-chain compromise.

---

## 33 — VULNERABILITY MANAGEMENT

Chaque vulnérabilité doit avoir :

`severity → owner → deadline → remediation → verification`

Créer des SLA internes :
- Critical ;
- High ;
- Medium ;
- Low.

Une vulnérabilité critique ne doit pas rester oubliée dans GitHub.

---

## 34 — SECURITY DISCLOSURE

Préparer un mécanisme permettant à un chercheur de sécurité de signaler une vulnérabilité.

À terme :
- security contact ;
- disclosure policy ;
- éventuellement security.txt ;
- processus de traitement ;
- suivi ;
- correction ;
- communication.

---

## 35 — DOCUMENTATION & ARCHITECTURE

Chaque décision importante doit être documentée.

Créer :

`/docs/architecture/ADR/`

Exemples :
- Pourquoi Supabase ?
- Pourquoi telle stratégie d'authentification ?
- Pourquoi cette structure de données ?
- Pourquoi ce mécanisme de permission ?
- Pourquoi ce service est séparé ?

Une future équipe doit pouvoir comprendre pourquoi une décision a été prise.

---

## 36 — BUSINESS CONTINUITY

La sécurité technique ne suffit pas.

Préparer :
- perte d'un fournisseur ;
- perte d'un développeur clé ;
- perte d'un compte cloud ;
- perte d'un domaine ;
- indisponibilité d'une personne clé ;
- crise médiatique ;
- incident juridique ;
- indisponibilité prolongée.

Yelen ne doit jamais dépendre d'une seule personne.

---

## 37 — GO / NO-GO FRAMEWORK

Avant chaque grande étape :

- Development 🟢 / 🔴
- Staging 🟢 / 🔴
- Production interne 🟢 / 🔴
- Launch 🟢 / 🔴
- National scale 🟢 / 🔴

Une exception doit être : documentée + acceptée + limitée dans le temps + propriétaire identifié.

---

## 38 — AUDIT CONTINU

Ce document n'est jamais considéré comme terminé.

À chaque chantier important :

`Build → Security Review → Test → Evidence → Verify → Update Master File`

---

## 39 — RÉFÉRENTIELS OFFICIELS

Le programme de sécurité Yelen doit s'appuyer notamment sur :
- NIST CSF 2.0 — gouvernance et gestion du risque.
- NIST SP 800-218 SSDF — développement logiciel sécurisé.
- OWASP ASVS — exigences de sécurité applicative.
- OWASP API Security Top 10 — sécurité des API.
- OWASP MASVS/MASTG — lorsque la version native sera développée.
- Supabase Production/Security guidance — pour l'implémentation spécifique de l'infrastructure actuelle.
- Référentiels ISO pertinents lorsque Yelen entrera dans une démarche formelle de certification.

---

## 40 — MÉTHODE DE TRAVAIL POUR L'INGÉNIEUR

**NE PAS TOUT FAIRE EN UN SEUL BLOC.**

La mission doit être exécutée :

- JOUR / LOT 1 — Audit.
- LOT 2 — Identity.
- LOT 3 — Authorization.
- LOT 4 — Database.
- LOT 5 — Secrets.
- LOT 6 — API.
- LOT 7 — Infrastructure.
- LOT 8 — Backups.
- LOT 9 — Recovery.
- LOT 10 — Monitoring.
- LOT 11 — CI/CD.
- LOT 12 — Supply chain.
- LOT 13 — Privacy.
- LOT 14 — Incident response.
- LOT 15 — Testing.
- LOT 16 — Pentest externe.
- LOT 17 — Load / resilience.
- LOT 18 — Production readiness.
- LOT 19 — Launch readiness.
- LOT 20 — Post-launch security operations.

Et si un chantier doit être découpé en 5, 10 ou 30 sous-lots, on le découpe.

La taille du lot doit être déterminée par sa complexité et son risque, pas par un nombre arbitraire.

---

## RÈGLE FINALE

**NE PAS MODIFIER YELEN SIMPLEMENT POUR COCHER UNE CASE.**

Avant chaque modification :
1. comprendre l'existant ;
2. identifier le risque ;
3. définir le contrôle ;
4. implémenter ;
5. tester ;
6. vérifier ;
7. documenter ;
8. seulement ensuite passer au lot suivant.

Aucun raccourci.
Aucune clé dans Git.
Aucun accès production inutile.
Aucune donnée sensible dans les logs.
Aucune autorisation basée uniquement sur le frontend.
Aucune modification d'architecture majeure sans justification.

---

## PREMIÈRE MISSION

### LOT 1 — SECURITY BASELINE & ARCHITECTURE AUDIT

Ne rien refactorer.
Ne rien casser.
Ne pas introduire de nouvelle architecture.

Analyser l'état actuel de :
- Yelen PWA ;
- Netlify ;
- Supabase ;
- Auth ;
- PostgreSQL ;
- Storage ;
- RLS ;
- API ;
- secrets ;
- Git ;
- environnements ;
- permissions ;
- routes ;
- données ;
- dépendances ;
- déploiement.

Produire :

`YELEN_SECURITY_MASTER.md`

et

`YELEN_SECURITY_GAP_ANALYSIS.md`

avec :

`CURRENT STATE → REQUIRED STANDARD → GAP → RISK → PRIORITY → RECOMMENDATION → EVIDENCE`

À la fin du Lot 1, arrêter le travail.
Présenter le rapport.
Ne pas commencer le Lot 2 avant validation du Lot 1.

---

## JOURNAL DES DÉCISIONS (log vivant, section 01 — Security Governance)

Chaque entrée suit le format `ID → Description → Risque → Contrôle →
Statut → Preuve → Date de vérification`. Le détail complet de chaque
analyse vit dans `YELEN_SECURITY_GAP_ANALYSIS.md` — ce journal n'en est
que la trace de décision, pour rester consultable sans relire tout le
gap analysis.

### DEC-2026-08-13-01 — GAP-14-01 : upgrade Next.js différé
**Description** : `npm audit fix --force` (next 16.2.1→16.3.0) non
exécuté malgré 5 vulnérabilités restantes (dont `next`).
**Risque** : exposition aux CVE listées (SSRF/DoS Image Optimization,
cache poisoning) tant que non appliqué.
**Contrôle** : analyse d'impact documentée (voir Lot 1.1 suite du gap
analysis) — build actuel `--webpack` (pas Turbopack, réduit la surface
des changements pertinents), 9 fichiers Server Actions à tester
spécifiquement (`serverActions.bodySizeLimit` durci en 16.3.0).
**Statut** : 🟠 IN PROGRESS — upgrade prévu comme chantier dédié testable
(pas un `--force` aveugle), pas de date fixée.
**Preuve** : `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` section Lot
1.1 suite, item 1. **Date** : 13/08/2026.

### DEC-2026-08-13-02 — GAP-10-01 : rate limiting mémoire — TEMPORARY ACCEPTED GAP
**Description** : rate limiting basé sur des `Map` en mémoire de
processus (login admin/citoyen/institution, OTP), non partagé entre
instances serverless.
**Risque** : sous charge concurrente réelle, le seuil affiché
("5 tentatives/15min") s'applique par instance, pas globalement — plus
permissif que prévu. Institution et citoyen n'ont **aucun** filet
persistant en secours (contrairement à l'admin, qui a un verrouillage
`failed_login_attempts`/`locked_until` en base, donc une vraie défense
en profondeur déjà en place pour ce flux précis).
**Contrôle** : accepté explicitement, temporairement, pour la phase
pré-lancement (trafic actuel minimal/démo).
**Statut** : ⚫ EXCEPTION APPROVED — **TEMPORARY ACCEPTED GAP**.
**Conditions de levée de l'exception (déclencheurs de migration vers un
store partagé — Supabase table dédiée ou équivalent)**, au moins un des
suivants :
1. Sortie de la phase pré-lancement/démo (avant l'ouverture publique réelle).
2. Confirmation (documentation Netlify ou observation réelle) que
   plusieurs instances de fonction tournent en concurrence sous le
   trafic réel de Yelen224.
3. Un incident réel observé où le rate limiting en mémoire n'a pas
   freiné une attaque (brute force/credential stuffing détecté a
   posteriori).
4. Dès que l'observabilité (sections 21-22, pas encore construite)
   permet de mesurer réellement la fréquence de cold start / le nombre
   d'instances concurrentes — aujourd'hui invérifiable.
5. En priorité sur les flux institution/citoyen (aucun filet persistant
   aujourd'hui), avant l'admin qui a déjà une défense en profondeur.
**Preuve** : `lib/edgeSecurity.ts`, `app/api/admin/auth/login/route.ts`,
`app/api/citoyen/auth/verify/route.ts`,
`app/api/institution/auth/*/route.ts`. **Date** : 13/08/2026.

### DEC-2026-08-13-03 — GAP-04-03 : MFA admin obligatoire — décision actée, implémentation différée
**Description** : décision de Bryan — MFA (TOTP) obligatoire pour tous
les comptes `admin_users`, actuellement optionnelle par compte
(`totp_enabled`).
**Risque** : un compte admin sans 2FA n'est protégé que par mot de passe
+ rate limit + verrouillage (déjà solide, mais MFA reste une couche
attendue pour des comptes à privilège élevé, section 24).
**Contrôle** : mécanisme TOTP déjà entièrement fonctionnel et audité
(`/api/admin/auth/2fa/setup|verify|disable`, secrets non exposés, codes
de secours bcryptés) — il ne manque que l'application obligatoire.
**Décision** : implémentation **non faite dans ce lot** — risque réel de
verrouiller le seul compte admin réel existant si l'état
`totp_enabled` de ce compte n'est pas d'abord confirmé/activé par Bryan.
Proposition d'implémentation minimale documentée (gate central dans
`lib/adminAuth.ts::authorizeAdmin()`, claim `mfaEnabled` dans le JWT,
liste d'exception `2fa.setup` uniquement) — voir gap analysis, à traiter
comme chantier dédié, séquencé : (1) Bryan active/confirme 2FA sur son
propre compte, (2) implémentation du gate, (3) test avec un compte
secondaire avant activation réelle.

**Mise à jour 13/08/2026 (même jour)** : Bryan confirme verbalement que
la 2FA TOTP est **déjà active** sur son compte admin (application tierce
type Google Authenticator, flux `/2fa/setup`→`/2fa/verify` déjà
utilisé). **Confirmation déclarative de Bryan, pas une vérification SQL
indépendante** — `SELECT totp_enabled FROM admin_users ...` reste la
preuve formelle si un jour nécessaire, mais le blocage opérationnel (le
gate d'application pourrait verrouiller un compte qui n'a pas encore la
2FA) est levé : étape 1 de la séquence ci-dessus considérée faite.
**Statut** : 🟢 VERIFIED (déclaratif Bryan) pour l'état du compte —
🟡 NEEDS REVIEW pour l'implémentation du gate, qui reste un chantier
séparé non commencé.
**Preuve** : `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` section Lot
1.1 suite, item 3 ; confirmation verbale de Bryan le 13/08/2026.
**Date** : 13/08/2026.

**Chantier MFA Admin — implémentation minimale livrée le 13/08/2026
(même jour)** : gate d'application implémenté conformément à la
proposition ci-dessus, 2 fichiers modifiés (pas de nouvelle table, pas
de nouveau mécanisme cryptographique) :
- `app/api/admin/auth/login/route.ts` : claim `mfaEnabled:
  admin.totp_enabled === true` ajouté au JWT au moment de la signature
  (état déjà connu avec certitude à ce stade — le TOTP vient d'être
  vérifié juste avant si `totp_enabled` était `true`).
- `middleware.ts` : `adminTokenValide()` renommée `verifierTokenAdmin()`
  et étendue pour décoder aussi `mfaEnabled` ; dans les deux blocs de
  protection (`/admin/*` et `/api/admin/*`), un compte avec
  `mfaEnabled=false` est redirigé vers `/admin/security` (pages) ou reçoit
  un 403 `MFA_SETUP_REQUIRED` (API), sauf pour une liste d'exception
  minimale : `/admin/security` (l'écran de configuration lui-même),
  `/api/admin/auth/logout`, `/api/admin/auth/me`,
  `/api/admin/auth/change-password`, `/api/admin/auth/2fa/*`.
- **Piège évité en vérifiant le contenu réel de la page avant de figer la
  liste d'exception** : `app/admin/security/page.tsx` appelle aussi
  `/api/admin/auth/change-password` (changement de mot de passe, même
  écran) — absent de la première version de la liste, aurait cassé cette
  fonctionnalité pour tout compte pas encore en 2FA. Corrigé avant
  livraison.
- **Limites assumées, documentées plutôt que cachées** : (1) les
  sessions signées avant ce déploiement n'ont pas le claim `mfaEnabled`
  (`undefined !== true`) — traitées comme "MFA non active" jusqu'à la
  prochaine connexion, comportement voulu (jamais un contournement
  silencieux), mais signifie qu'un admin déjà connecté au moment du
  déploiement sera redirigé une fois vers `/admin/security` avant que sa
  session se rafraîchisse. (2) Après activation de la 2FA via
  `/admin/security`, le JWT de la session en cours garde l'ancien claim
  `mfaEnabled:false` jusqu'à la prochaine reconnexion (pas de re-émission
  du cookie dans `/2fa/verify` dans cette version minimale, pour rester à
  2 fichiers) — se reconnecter après activation pour que l'application
  reconnaisse pleinement le changement. (3) **Non testé en navigateur
  réel** (aucun outil de ce type disponible dans cet environnement) —
  seuls `tsc --noEmit` et `npm run build` confirmés propres ; test
  réel du parcours (compte sans 2FA → redirection → configuration →
  reconnexion → accès normal) à faire par Bryan.
**Tests** : `npx tsc --noEmit` → exit 0 (×2, avant et après le correctif
change-password). `npm run build` → exit 0 (×2), ~200+ routes compilées.

**Validation CEO 13/08/2026** : tests TypeScript et build acceptés comme
suffisants, implémentation minimale validée telle quelle. Aucune
modification supplémentaire demandée sur ce chantier. Trois points
comportementaux à retenir, formalisés explicitement ici :

1. **Sessions existantes** : une session admin déjà ouverte au moment du
   déploiement de ce gate peut nécessiter une reconnexion — son JWT a été
   signé avant l'ajout du claim `mfaEnabled`, donc traité comme "MFA non
   active" jusqu'au prochain login.
2. **Après activation de la MFA** : une reconnexion est **actuellement
   nécessaire** pour que le JWT soit régénéré avec `mfaEnabled=true` —
   `/api/admin/auth/2fa/verify` met à jour `admin_users.totp_enabled` en
   base mais ne réémet pas le cookie de session en cours.
3. **Amélioration future possible (hors périmètre de ce chantier)** :
   régénérer/révoquer immédiatement la session dans
   `/api/admin/auth/2fa/verify` après activation réussie de la MFA (même
   pattern de signature JWT que `login/route.ts`), pour éviter l'étape de
   reconnexion manuelle du point 2. Non implémenté ici — décision CEO de
   ne pas élargir le périmètre du chantier actuel.

**Statut final** : ✅ **Chantier MFA Admin clôturé** (validation CEO
13/08/2026) — implémentation minimale acceptée, comportement documenté,
amélioration future notée mais explicitement hors périmètre. Aucun
commit, aucun déploiement.

### DEC-2026-08-13-04 — GAP-04-02 : fallback OTP statique toléré hors production stricte
**Description** : ni `CITOYEN_OTP_FALLBACK` ni `INSTITUTION_OTP_FALLBACK`
ne sont bloqués par un garde `NODE_ENV==='production'` — si définies sur
Netlify (y compris l'environnement actuel yelen224.netlify.app), le
fallback y fonctionnerait aussi.
**Risque** : quiconque connaît la valeur du fallback peut s'authentifier
comme n'importe quel citoyen/institution par numéro de téléphone seul,
sur n'importe quel environnement où la variable est définie.
**Décision de Bryan (option choisie explicitement)** : ne pas bloquer
pour l'instant — `yelen224.netlify.app` reste documenté comme
environnement de développement/test (pas le domaine produit final
`yelen224.app`), et Bryan l'utilise activement pour tester les parcours
d'inscription/connexion. Bloquer aujourd'hui casserait cette capacité de
test tant qu'aucun fournisseur SMS réel n'est branché.
**Contrôle** : fournisseur SMS de production identifié dans le code
(`lib/auth/otp.ts`, commentaire "Nimba SMS ou autre") — dépendances
requises : compte + clé API Nimba SMS (action Bryan, externe au code),
puis implémentation de l'adaptateur d'envoi réel (`envoyerSmsNimba`,
actuellement un TODO commenté) une fois la clé disponible. Le reste du
mécanisme (génération de code aléatoire, hachage, TTL, usage unique) est
déjà en place des deux côtés (citoyen et institution).
**Statut** : ⚫ EXCEPTION APPROVED — **TEMPORARY ACCEPTED GAP**, à
réévaluer dès qu'un fournisseur SMS réel est branché (le fallback perdra
alors sa raison d'être et pourra être supprimé, pas seulement bloqué).
**Preuve** : `lib/auth/otp.ts`, `app/api/institution/auth/send-otp/route.ts`.
**Date** : 13/08/2026.

### DEC-2026-08-13-05 — LOT 1.3 : Security Surface Validation & Regression Audit

**Description** : audit de régression demandé par le CEO après les Lots
1, 1.1, 1.2 et le chantier MFA Admin — vérifier que rien n'a été cassé,
zéro nouvelle fonctionnalité, correction uniquement si bug démontré.
**Méthode** : relecture des diffs réels (`git diff` contre HEAD) de
chaque fichier touché par ces lots, relecture intégrale de
`middleware.ts`, vérification croisée des allowlists MFA contre les
routes réelles sur disque, `tsc --noEmit` + `npm run build` finaux.
**Résultat** : **aucune régression trouvée**. Détail complet (11 zones
vérifiées : authentification, sessions/JWT, MFA Admin, middleware,
autorisations, routes sensibles, RLS, séparation des rôles, OTP, API
sensibles, build) dans `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`,
section "LOT 1.3".
**Seule observation notée** (pas une régression, pas corrigée) : les
réponses de blocage du middleware (géoblocage/mur mobile/rate limit/
redirections admin) ne portent pas les headers de sécurité posés sur la
réponse normale — caractéristique pré-existante à tous les lots
sécurité de cette session, sévérité faible, hors périmètre de ce lot.
**Décision** : aucune correction appliquée — conforme à la consigne
"corriger uniquement un problème directement démontré".
**Tests** : `npx tsc --noEmit` → exit 0. `npm run build` → exit 0,
~200+ routes compilées.
**Statut** : 🟢 VERIFIED (sur le périmètre code) — les items RLS/policies/
grants restent NOT VERIFIED (accès SQL non disponible), inchangés depuis
le Lot 1.1.
**Preuve** : `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` section
LOT 1.3, bilan des risques ouverts.
**Date** : 13/08/2026.

### DEC-2026-08-13-06 — LOT 1.4 : Production Configuration Verification

**Description** : audit de configuration demandé par le CEO — RLS,
policies, grants, rôles anon/authenticated, configuration Supabase/
Netlify, présence des variables d'environnement, protection GitHub,
configuration de déploiement, headers de sécurité effectivement servis.
Aucune modification de code/migration/configuration.
**Découverte méthodologique** : cet environnement dispose en réalité
d'un accès réseau sortant (non supposé au préalable) — plusieurs
contrôles ont donc pu être vérifiés **en conditions réelles** sur
`https://yelen224.netlify.app` plutôt que d'être marqués NOT VERIFIED
par défaut. Aucun outil `gh`/`netlify` CLI disponible (confirmé, pas
supposé) — tout ce qui nécessite une authentification externe reste
NOT VERIFIED.
**Résultats vérifiés en conditions réelles** :
- HTTPS forcé (301 http→https) : ✅ confirmé.
- 3 routes API sensibles testées sans session (`institution/profile`,
  `admin/citoyens`, `citoyen/favoris`) → **401** sur les 3, aucune fuite
  de donnée constatée.
- Protection GitHub : confirmé **non vérifiable** depuis cet
  environnement (API GitHub répond 404/401 sans authentification,
  repo privé, aucun outil CLI disponible) — pas juste supposé absent.
- Variables d'environnement locales : 16 noms confirmés présents (valeurs
  jamais lues), 1 absence notable (`NEXT_PUBLIC_APP_URL`, utilisée par
  WebAuthn) à faire vérifier par Bryan.
**Résultat le plus important — FAILED (incohérence réelle constatée)** :
les headers de sécurité (`X-Frame-Options`, `Referrer-Policy`,
`X-XSS-Protection`, `Permissions-Policy`) ne sont présents QUE sur
`/admin/login` parmi les 5 routes testées en direct — absents sur `/`,
`/recherche`, `/institution/connexion` (pages statiques) ET sur
`/api/rdv-disponibilite` (route API fraîche, non mise en cache). Seuls
`Strict-Transport-Security` et `X-Content-Type-Options` sont
systématiquement présents partout. **Cause non déterminée avec
certitude** (cache Netlify/Next.js vs ancien déploiement partiel vs
autre) — aucune hypothèse retenue sans preuve. Recommandation : re-tester
après le prochain déploiement réel pour distinguer un artefact de cache
d'un vrai bug de configuration.
**Décision** : aucune correction (audit de configuration uniquement,
consigne respectée).
**Statut** : voir tableau récapitulatif complet dans
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section LOT 1.4 —
majorité NOT VERIFIED (accès dashboard requis), quelques VERIFIED réels
obtenus en direct, 1 FAILED (headers incohérents) à investiguer.
**Preuve** : commandes `curl` exécutées en direct contre le domaine de
production, sorties complètes dans le Gap Analysis.
**Date** : 13/08/2026.

### DEC-2026-08-13-07 — LOT 1.5 : Production Security Headers Remediation

**Cause** (identifiée par comparaison directe `git show HEAD:middleware.ts`
vs code local, pas supposée) : le `middleware.ts` **déployé** (commit
`3c1d101`) a un `matcher` restreint à `['/admin/:path*',
'/api/admin/:path*']` — les 6 headers de sécurité qu'il pose pourtant
sans condition ne s'appliquent donc jamais en dehors de ces 2 préfixes.
Le code local a déjà un matcher élargi à tout le site (session du
09/08/2026, jamais déployé) — la cause première est un **déploiement
manquant**, pas un bug de code actif.

**Correction** (2 vraies corrections découvertes nécessaires en creusant,
pas juste "redéployer le matcher élargi tel quel") :
1. **`Permissions-Policy`** corrigée de `camera=(), microphone=(),
   geolocation=()` à `camera=(self), microphone=(), geolocation=(self)`
   — l'ancienne valeur (déjà dans le code déployé, masquée par le bug de
   matcher ci-dessus) aurait cassé la géolocalisation (8 fichiers réels
   l'utilisent) et le scanner QR institution (caméra) dès que le matcher
   aurait été corrigé seul. Trouvé en inventoriant le code avant de
   déployer quoi que ce soit, pas après coup.
2. **CSP** enrichie de sources réelles manquantes (`*.tile.openstreetmap.org`,
   `formsubmit.co`) + **migration complète des polices Google vers
   next/font/google auto-hébergé** (9 fichiers, décision explicite de
   Bryan de ne pas garder de dépendance externe par habitude) — les
   exceptions CSP Google Fonts, devenues inutiles, ont été retirées.
   Toujours en Report-Only.
**Bug réel trouvé et corrigé pendant la migration des polices** : Sora
n'a pas de graisse 900 statique disponible (confirmé par les types
`next/font/google`, pas deviné) — 2 fichiers l'utilisaient sans effet
réel (le navigateur retombait déjà sur 800 avant migration, même
comportement après correction).
**Tests** : `npx tsc --noEmit` → exit 0. `npm run build` → exit 0,
~200+ routes compilées.
**Résultat** : correctifs prêts, vérifiés par compilation uniquement.
**Aucun déploiement effectué** (interdit sans validation CEO) — donc
**aucune vérification HTTP réelle du correctif n'a pu être faite** ; les
tests live du Lot 1.4 restent valables pour l'ancien code toujours en
production. Étape 5 (WebAuthn) : `NEXT_PUBLIC_APP_URL` a un repli sûr
dans le code (`lib/config.ts`), donc pas de risque de crash ; sa valeur
réelle en production reste NOT VERIFIED (dashboard non accessible), mais
le repli correspond déjà à la bonne URL de toute façon.
**Statut** : 🟡 NEEDS REVIEW — correction prête, en attente d'un
déploiement (décision CEO) puis d'une re-vérification HTTP réelle après
coup.
**Preuve** : `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section
LOT 1.5, détail complet des 6 étapes.
**Date** : 13/08/2026.
