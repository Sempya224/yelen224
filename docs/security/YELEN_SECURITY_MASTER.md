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

**Mise à jour — déploiement contrôlé autorisé, vérification incomplète** :
Bryan a autorisé un déploiement contrôlé, scopé à 19 fichiers
strictement liés à la sécurité (commit `4acf972`, poussé sur
`origin/main`). Après ~30 minutes de sondage HTTP réel, le déploiement
Netlify n'était pas encore visible (route non cachée testée
répétitivement) — impossible de distinguer un build encore en cours
d'un échec sans accès dashboard. **Décision de Bryan : vérification
reportée à quand il aura accès à Netlify.** Le CI GitHub Actions livré
au Lot 1.1 a échoué sur `build-and-typecheck` (cause probable : secrets
serveur absents des GitHub Secrets) — n'affecte pas Netlify, action de
configuration à part si le CI doit devenir fonctionnel.
**Statut Lot 1.5** : 🟠 NOT CLOSED — en attente de la vérification
production par Bryan. Détail complet et checklist de reprise dans
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section "LOT 1.5 —
Déploiement contrôlé".

### DEC-2026-08-14-01 — LOT 1.5 : build cassé, dépendances manquantes corrigées

**Cause** : le commit `4acf972` (déploiement contrôlé Lot 1.5) incluait
des fichiers dépendant d'autres chantiers jamais commités séparément
(POC i18n, Signalements case management, et un chantier géoblocage/
anti-abus/mur-mobile citoyen du 09-12/08/2026 jusque-là absent de
CLAUDE.md) — Netlify a échoué au build (modules introuvables +
fetch police Google en cascade sur un build déjà instable).
**Correction** : fermeture complète et vérifiée (pas devinée) des
dépendances locales manquantes — système i18n complet, `lib/
signalementsConstants.ts`, `lib/geoAccess.ts`/`edgeSecurity.ts`/
`deviceAccess.ts` + leurs pages cibles (`region-non-disponible`,
`acces-mobile-requis`, `geo-bypass`), `next-intl` dans `package.json`.
Décision explicite de Bryan : inclure le chantier géoblocage/mur-mobile
tel quel plutôt que de le retirer du middleware — toutes ses
fonctionnalités restent désactivées par défaut (aucune variable d'env
définie sur Netlify), seul le blocage des signatures de scan connues
est actif en permanence.
**Tests** : `npx tsc --noEmit` et `npm run build` exit 0 en local avant
chaque push. Commit `bb36006` déployé et confirmé **Published** sur
Netlify (capture dashboard fournie par Bryan).
**Résultat** : Lot 1.5 effectivement en production. Checklist de
vérification exécutée en direct par `curl` sur `https://
yelen224.netlify.app` (headers cohérents sur `/`, `/recherche`,
`/institution/connexion`, `/admin/login`, 404, routes API — CSP,
Permissions-Policy, HSTS, zéro fetch externe Google Fonts restant).

**Bug réel trouvé pendant cette vérification** : `/api/admin/kpis` (401
sans session) et `/admin` (redirect login sans cookie) ne renvoyaient
**aucun** header de sécurité — seul HSTS restait (injecté par Netlify,
hors middleware). Cause : `NextResponse.redirect()`/`.json()`/
`.rewrite()` construit une réponse neuve qui ne recopie jamais les
headers déjà posés sur l'objet `response` d'origine. **Correction** :
helper `appliquerHeadersSecurite()` extrait et appliqué sur les 11
points de sortie du middleware (pas seulement le "laisser passer" par
défaut) — couvre notamment le blocage UA suspect, réellement actif en
production. Commit `bdbf215`, `tsc`/`build` propres, revérifié en
production par `curl` : headers désormais présents sur les deux routes.

**Incident annexe (résolu)** : le premier push de ce correctif a été
refusé par GitHub (`GH007`, protection email activée au niveau
organisation Sempya224). Résolu en configurant l'email noreply GitHub
(`223202901+Sempya224@users.noreply.github.com`) pour ce dépôt
uniquement, sur autorisation explicite de Bryan — le réglage
organisationnel lui-même reste actif, à traiter par Bryan quand il le
jugera pertinent (pas urgent).

**Statut Lot 1.5** : ✅ **CLOS** — déployé, vérifié en production, bug de
régression trouvé pendant la vérification elle-même corrigé et
revérifié. Seul reste GAP-16-01 (CSP encore Report-Only, bascule en
mode bloquant nécessite une navigation réelle par Bryan).
**Date** : 14/08/2026.

### DEC-2026-08-14-02 — Clôture des 5 requêtes SQL en attente (GAP-06-01/02/03/04/05)

**Cause** : 5 items du registre RLS restaient NOT VERIFIED faute d'accès
SQL Editor pendant les Lots précédents.
**Vérification** (exécutée par Bryan, résultats transmis) :
1. RLS 7 tables historiques → `relrowsecurity=true` partout.
2. Policies `institution_otp` → 0 ligne (0 policy au total).
3. `has_function_privilege('anon', 'appliquer_recuperations_dues()',
   'execute')` → `true` (risque confirmé).
4. Grants `anon`/`authenticated` → confirmés larges sur `institution_otp`,
   `institution_sessions`, `transactions_financieres`,
   `institution_partenariat_demandes`, `offres` (non couvertes par le
   point 1 d'origine).
5. `institutions.langue` → `jsonb`.
**Décision/Correction** :
- GAP-06-01, 06-02 : aucune action requise, résultats conformes au
  pattern de sécurité déjà en place (RLS actif fait écran malgré les
  grants larges — comportement Supabase par défaut attendu).
- GAP-06-03 : confirmé que `institution_responsable_et_fix_langue.sql`
  est la migration réellement exécutée le 11/07/2026 ; l'autre fichier
  (`institution_responsable.sql`) est un brouillon obsolète — suppression
  laissée à la discrétion de Bryan, aucune urgence.
- GAP-06-04 : `REVOKE EXECUTE ON FUNCTION
  appliquer_recuperations_dues() FROM PUBLIC, anon, authenticated`
  exécuté par Bryan, revérifié `false` immédiatement après.
- GAP-06-05 : même conclusion que 06-01/02 — RLS actif sur les 5 tables
  supplémentaires découvertes, pas de contournement réel malgré les
  grants larges.
**Résultat** : les 5 items du registre `06 — Supabase Database Security`
sont **tous clos**. Seule action volontaire non prise : suppression du
fichier de migration brouillon (décision produit mineure, pas de
sécurité).
**Date** : 14/08/2026.

---

## CLÔTURE DE SESSION — 14/08/2026

**Décision CEO** : arrêt du chantier sécurité pour aujourd'hui, reprise
un autre jour sans urgence — ce n'est pas un travail à faire
précipitamment. Prochain focus : la refonte (design).

**Bilan** : Lot 1.5 clos et vérifié en production (avec un bug de
régression trouvé et corrigé pendant la vérification elle-même), les 5
items RLS/grants/EXECUTE du registre database security clos avec
correctif appliqué où nécessaire (GAP-06-04). Rien de bloquant en
suspens pour le reste du produit.

**Reste ouvert pour la prochaine reprise** (détail dans
`YELEN_SECURITY_GAP_ANALYSIS.md`, section de clôture) : GAP-16-01 (CSP
Report-Only → bloquant, nécessite navigation réelle par Bryan),
GAP-14-01 (bump `next` majeur, 5 vulnérabilités npm), GAP-14-02/03
(réglages GitHub branch protection/required check). Aucun de ces points
ne bloque le reste du produit ni la refonte à venir.

---

## REPRISE — LOT 2 : Identity & Authentication (30/08/2026)

Reprise du chantier sécurité, 16 jours après la pause du 14/08/2026 (le
16/08 n'a été qu'un aparté ponctuel pendant le chantier Trust Model, voir
GAP-06-06/07/08 dans le gap analysis — pas une reprise volontaire de ce
plan). Lot 2 = Identity, suite logique de la séquence section 40.

### DEC-2026-08-30-01 — Découverte : chantier "Auth Security" non documenté, staged, migration non confirmée

**Description** : en auditant les routes de connexion citoyen/
institution pour le Lot 2, découverte de 13 fichiers portant des
commentaires "chantier 28/08/2026" (2 jours avant cette reprise),
référençant un nouveau module `lib/security/authSecurity.ts` (rate
limiting device+IP persistant, remplaçant les `Map` mémoire) et une
migration `20260828000004_auth_security.sql` créant 3 tables. **Aucune
trace de ce chantier** dans `git log` (dernier commit `038fb16` du
20/08), dans ce document, ni dans CLAUDE.md.
**Risque** : `git status` a confirmé que le code était staged (jamais
commité) et que la migration SQL était même untracked par git —
contrairement à toute autre migration de ce dépôt, jamais annotée
"exécuté par Bryan" une fois confirmée. Si ce code avait été commité/
déployé sans que la migration ait tourné en base, la connexion/
inscription citoyen et institution aurait cassé immédiatement en
production (tables inexistantes).
**Contrôle** : Bryan, en déplacement au moment de la découverte, n'a pas
pu confirmer immédiatement l'état de la migration. Requête fournie pour
vérification dès son retour :
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('auth_device_security','auth_ip_security','auth_security_events');
```
**Décision** : finir ce chantier dans le cadre du Lot 2 (décision
explicite de Bryan) plutôt que le traiter séparément — voir
DEC-2026-08-30-02.
**Statut** : 🟠 IN PROGRESS — état de la migration toujours **UNKNOWN**
à la clôture de ce Lot 2, aucun commit/déploiement fait.
**Preuve** : `git log`, `git status --porcelain`, `git diff --cached`
sur `lib/security/authSecurity.ts` et `app/api/{citoyen,institution}/
auth/**`. **Date** : 30/08/2026.

### DEC-2026-08-30-02 — GAP-10-01 : couverture étendue aux 5 flux de connexion (code complet, non déployé)

**Description** : le chantier du 28/08 ne couvrait que citoyen (lookup/
verify/register/totp) et institution OTP (lookup/send-otp/verify-otp/
register). Complété dans ce Lot 2 pour les 5 flux restants : institution
PIN (`pin/verify`), institution WebAuthn (`webauthn/auth-verify`),
institution membre d'équipe (`membre/login`), admin (`admin/auth/
login`), employé (`clock/auth/login`).
**Risque résiduel** : identique à DEC-2026-08-13-02 tant que non
déployé — rate limiting toujours en `Map` mémoire fragile en
production réelle (le code corrigé n'y est pas encore).
**Contrôle** : réutilisation de la catégorie `institution_login`
existante pour PIN/WebAuthn/membre (zéro changement de schéma) ;
2 nouvelles catégories `admin_login`/`employee_login` ajoutées à la
contrainte `CHECK` de la migration **non exécutée** (additif, sans
risque tant qu'elle n'a pas tourné — à confirmer par Bryan avant
exécution). Verrouillages persistants par compte déjà existants
(admin, membre, employé) conservés en défense en profondeur, pas
remplacés.
**Statut** : 🟠 IN PROGRESS — remplace le statut ⚫ EXCEPTION APPROVED
précédent (13/08) : ce n'est plus une exception acceptée faute de
solution, une solution existe pour les 5 flux, il ne manque que la
confirmation DB (DEC-2026-08-30-01) et le commit/déploiement + une
vérification production équivalente au Lot 1.5.
**Tests** : `npx tsc --noEmit` → exit 0 sur l'ensemble des fichiers
touchés (16 au total avec ceux du 28/08). Aucun test fonctionnel réel
possible tant que la migration n'est pas confirmée exécutée.
**Preuve** : détail complet dans `docs/security/
YELEN_SECURITY_GAP_ANALYSIS.md`, section "LOT 2". **Date** : 30/08/2026.

### DEC-2026-08-30-03 — GAP-04-04 (nouveau) : aucune révocation serveur des sessions JWT institution/admin/employé

**Description** : logout, changement de mot de passe admin,
désactivation 2FA admin, demande de suppression de compte institution,
et "Déconnecter tous les autres appareils" (institution) ne suppriment
que des cookies et/ou des `*_remember_tokens` — jamais le JWT
lui-même. Un jeton déjà émis reste valide jusqu'à ses 8h/12h naturelles
quelle que soit l'action prise ensuite par le titulaire du compte.
Citoyen est la seule exception (vraie session Supabase Auth, révocable
par `signOut()`).
**Risque** : jeton volé exploitable pendant des heures après toute
action corrective légitime — y compris une fonctionnalité nommée
explicitement pour l'empêcher ("déconnecter tous les autres appareils").
**Contrôle** : aucune correction appliquée — décision d'architecture
(liste de révocation par compte, ou raccourcissement de la durée de vie
du JWT), pas un correctif ponctuel. Proposition documentée dans le gap
analysis, non implémentée.
**Statut initial** : 🟡 NEEDS REVIEW — décision de Bryan requise avant
tout code.
**Preuve** : `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section
"LOT 2", GAP-04-04. **Date** : 30/08/2026.

**Mise à jour — même jour, décision de Bryan reçue ("Attack ceci")** :
implémentation immédiate plutôt que report. `session_revoked_at` ajouté
à `admin_users`/`institutions` (migration
`20260830000001_session_revocation.sql`), vérifié dans
`lib/adminAuth.ts`/`lib/institutionAuth.ts` contre le claim `iat` du
JWT, écrit par 6 actions (change-password admin, 2FA disable admin,
suppression de compte institution, 2FA disable institution, changement
de PIN institution, "déconnecter tous les autres appareils"). Cas
particulier traité pour cette dernière : réémission d'un JWT frais pour
l'appareil appelant (seule action où la session courante doit survivre).
Employé explicitement exclu — aucun flux de compromise-recovery n'existe
encore côté employé.
`npx tsc --noEmit` → exit 0. **Aucun commit, aucun déploiement** — la
migration `20260828000004_auth_security.sql` (GAP-10-01) ET celle-ci
sont toutes deux d'exécution non confirmée ; les 2 chantiers du Lot 2
sont désormais liés par la même condition de clôture.
**Statut final Lot 2** : 🟠 IN PROGRESS — 2 correctifs complets
(GAP-10-01 étendu, GAP-04-04 implémenté), aucun déployé.
**Date** : 30/08/2026.

**Statut Lot 2** : rapport présenté. Conforme à la méthode de travail
(section 40) : pas de Lot 3 sans validation explicite de Bryan. Avant
toute chose, reste bloquant : la vérification par Bryan de l'état des 2
migrations (`20260828000004`, `20260830000001`) — requêtes SQL fournies
dans le gap analysis et ci-dessus.

---

## MISSION — Sécurisation de l'accès Administration (30/08/2026)

Brief CEO dédié, 9 exigences niveau OWASP admin interface hardening,
reçu le même jour juste après la clôture du Lot 2. Traité comme son
propre mini-cycle audit → validation → correction, pas une extension du
Lot 2 (numérotation de gap séparée dans le gap analysis, section
"MISSION — Sécurisation de l'accès Administration").

### DEC-2026-08-30-04 — Découverte annexe critique : `middleware.ts` supprimé hors git

**Description** : en préparant l'audit de cette mission (le fichier
porte justement la protection `/admin`), `middleware.ts` (318 lignes)
introuvable sur disque. `git status` a montré une suppression **NON
stagée** ("Changes not staged for commit: deleted: middleware.ts") —
contrairement aux ~600 autres changements en attente ce jour-là
(restructuration `app/institution/[id]/dashboard` → `app/[slug]/[id]/`),
qui sont tous des suppressions/renommages **stagés** délibérément. Cette
distinction (stagé vs non stagé) a permis de conclure avec confiance à
une perte accidentelle, hors du flux de la restructuration en cours —
pas une hypothèse, un fait vérifiable par `git status`.
**Risque** : sans ce fichier, aucun header de sécurité, aucune CSP,
aucun géoblocage, et surtout **aucune application du gate MFA
obligatoire admin** (chantier du 13/08) n'était plus actif dans l'arbre
de travail.
**Correction** : `git restore middleware.ts` — récupère exactement la
version du dernier commit (`bdbf215`, 13/08/2026). Aucune autre
modification du dépôt affectée (602 → 601 entrées `git status`, delta
de -1 exactement). `npx tsc --noEmit` → exit 0 après restauration,
aucune dérive avec les libs modifiées le même jour (`lib/security/
authSecurity.ts`, `lib/adminAuth.ts`, `lib/institutionAuth.ts`).
**Statut** : ✅ CLOS — fichier restauré, vérifié, aucune perte de
travail. **Date** : 30/08/2026.

### DEC-2026-08-30-05 — Mission Admin Security : 3/9 points corrigés

**Description** : audit des 9 exigences du brief contre l'état réel du
code. 3 déjà satisfaites (authentification séparée, MFA obligatoire
TOTP, RBAC réel avec deny-by-default). 3 corrigées ce jour sur decision
explicite de Bryan ("Oui, vas-y" + choix "variable d'environnement" pour
le segment secret) :
1. **Point 1** : `/admin` en dur sans cookie → 404 muet (au lieu d'un
   redirect révélant l'existence de la console). Un navigateur avec un
   cookie (même expiré) garde le comportement existant, pour ne pas
   casser la navigation interne du dashboard.
2. **Point 2** : `ADMIN_ENTRY_TOKEN` (variable d'environnement, valeur
   au choix de Bryan, jamais devinée) — absent par défaut, fail-open,
   même discipline que `GEO_BLOCK_ENABLED`. `/api/admin/**` volontairement
   non préfixé (appels fetch same-origin absolus, protection réelle déjà
   assurée par JWT+RBAC, conforme au point 8 du brief lui-même).
3. **Point 7** : échecs de connexion admin (mot de passe, TOTP) désormais
   journalisés dans `admin_logs` (`action: 'LOGIN_FAILED'`), absent
   avant ce jour — seul le compteur de verrouillage existait, invisible
   en audit.
**Reste ouvert** : point 6 (réseau/IP allowlist, détection nouvel
appareil admin, réauth critique — infrastructure/décision requise),
immuabilité `admin_logs` (GAP-06-07, ouvert depuis le 16/08), MFA
phishing-resistant (non obligatoire selon le brief), suite de tests
dédiée du point 9.
**Tests** : `npx tsc --noEmit` → exit 0. Comportement à
`ADMIN_ENTRY_TOKEN` absent vérifié par relecture comme strictement
identique à avant (fail-open réel, pas supposé). **Aucun test
navigateur réel possible.**
**Statut** : 🟠 IN PROGRESS — 3/9 corrigés, code non commité/non
déployé. **Action requise de Bryan avant toute mise en prod** : choisir
et configurer `ADMIN_ENTRY_TOKEN` (`.env.local` puis Netlify), puis
tester en conditions réelles le parcours complet décrit dans le gap
analysis avant d'activer la variable en production.
**Preuve** : `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section
"MISSION — Sécurisation de l'accès Administration". **Date** :
30/08/2026.

---

## MISSION 2 — Hardening complet de l'accès Administration (30/08/2026, même jour)

Brief CEO élargi (10 exigences), reçu juste après la mission 1
ci-dessus, avec consigne explicite : auditer d'abord, proposer les
migrations avant toute modification.

### DEC-2026-08-30-06 — middleware.ts supprimé hors git, restauré

Voir détail complet dans le gap analysis, section "Mission 2". Résumé :
suppression **non stagée** de `middleware.ts` (distincte des ~600
suppressions/renommages stagés de la restructuration en cours),
diagnostiquée comme accidentelle plutôt que devinée, restaurée par
`git restore`. Aucune perte de travail (602 → 601 entrées `git status`).
**Clos**. **Date** : 30/08/2026.

### DEC-2026-08-30-07 — Décisions de Bryan avant code

1. Point 7 (sessions) : table `admin_sessions` complète (pas un patch
   du timestamp de la Mission 1) — "Recommandé" choisi.
2. Point 3 (rôles fonctionnels) : reporté — un seul compte admin réel
   existe aujourd'hui, pas urgent.
3. Points 5/8/9 : traiter maintenant, sans attendre la décision sur les
   rôles.

### DEC-2026-08-30-08 — Table admin_sessions + réauthentification + immuabilité admin_logs, implémentés

**Description** : voir détail technique complet dans le gap analysis,
section "Mission 2". Résumé :
- `admin_sessions` (migration `20260830000002`) remplace
  `admin_users.session_revoked_at` (migration `20260830000001`, amendée
  le jour même, jamais exécutée) — révocation par session individuelle,
  expiration d'inactivité (60 min) en plus de l'absolue (8h), rotation
  de session après réauthentification.
- `POST /api/admin/auth/reauth` — mot de passe + TOTP, fenêtre de
  fraîcheur 10 min, appliqué à la gestion des comptes admin (créer/
  modifier/supprimer) et aux exports. `auth-security/unblock`
  volontairement exclu (jugé action de support routinière, pas un
  changement de configuration de sécurité) — à reconsidérer si Bryan
  n'est pas d'accord avec cette lecture.
- `admin_logs` immuable (GAP-06-07 clos) — même trigger que
  `journal_activite`/`signalement_events`/`auth_security_events`.
- Refus de permission désormais journalisés centralement
  (`lib/adminAuth.ts::authorizeAdmin`), plus besoin de le faire route
  par route.
**Tests** : `npx tsc --noEmit` → exit 0 à chaque étape et sur l'ensemble
final. **Aucun test réel possible** — 3 migrations non exécutées.
**Statut** : 🟠 IN PROGRESS — code complet pour les points 5/7/8/9
(partiel), non commité, non déployé. Points 3, 4 (phishing-resistant),
6 (réseau), et la partie détection/alerting active du point 9 restent
ouverts, documentés comme tels.
**Action requise de Bryan avant tout commit** : exécuter (ou confirmer
l'état de) 3 migrations —
`20260830000001_session_revocation.sql` (amendée, institutions
uniquement désormais), `20260830000002_admin_sessions.sql`,
`20260830000003_admin_logs_immuable.sql` — en plus des 2 migrations
déjà en attente du Lot 2 (`20260828000004_auth_security.sql`,
et la version d'origine de `20260830000001`). Puis test réel en
navigateur du parcours complet (login → session admin_sessions créée →
navigation → reauth sur une action critique → logout révoque bien
seulement cette session).
**Preuve** : `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section
"MISSION 2 — Hardening complet de l'accès Administration". **Date** :
30/08/2026.

**Statut Mission 2** : rapport présenté, code prêt mais non déployé.
Prochaine reprise : décision de Bryan sur la priorité entre (a) exécuter
les migrations et déployer ce qui est prêt, (b) continuer sur les points
encore ouverts (réseau, détection active, rôles fonctionnels quand une
équipe existera), ou (c) autre chantier.

---

## MISSION — Trusted Device / Device Enrollment (30/08/2026, même jour)

Brief CEO dédié, 8 exigences + 8 cas de test, consigne explicite : audit
→ proposition de schéma → validation → code. Bryan a validé 2 décisions
avant tout code (réutiliser l'existant plutôt que des tables dédiées ;
notification + confirmation différée plutôt qu'un blocage dur), puis
donné le feu vert ("Let go").

### DEC-2026-08-30-09 — Schéma Trusted Device validé et implémenté

**Description** : voir détail technique complet dans le gap analysis,
section "Mission — Trusted Device". Résumé : `citoyen_remember_tokens`/
`institution_remember_tokens` augmentées d'un statut de confiance
(`pending`/`trusted`/`revoked`) plutôt que 2 nouvelles tables — premier
appareil approuvé direct, appareil suivant `pending` + notifié (citoyen
seulement — pas de canal institution), promotion automatique à la
réutilisation réussie, révocation en soft-delete (historique conservé).
**Incident de conception corrigé en cours de route** : le plan prévoyait
un appel `supabase.auth.admin.signOut()` sur révocation citoyen —
abandonné après avoir réalisé que ça casserait `revoke-all`
lui-même (qui exclut délibérément l'appareil courant). Corrigé avant
d'écrire le code, pas après un bug constaté.
**Limite assumée et documentée** : la révocation d'un appareil empêche
sa reconnaissance future mais ne tue pas une session déjà ouverte sur
cet appareil précis, sauf pour `institution/remember/revoke-all` (seule
route qui touche aussi `institutions.session_revoked_at`, GAP-04-04 de
ce matin). Un vrai cloisonnement par appareil demanderait une
architecture `*_sessions` comme celle construite pour l'admin —
chantier séparé, non fait ici.
**Non fait** : évaluation de risque adaptative au-delà de connu/inconnu
(Cas G du brief), canal de notification institution, confirmation
manuelle explicite (la promotion automatique existe déjà).
**Incident de process pendant ce chantier** : une vérification `tsc`
lancée en arrière-plan a été considérée à tort comme réussie (sortie
vide lue avant la fin réelle du process) — un vrai bug (`statutPourNouvelleLigne`
non défini) est passé inaperçu un instant. Corrigé après que Bryan a
signalé l'incohérence sur un chantier précédent le même jour ; toutes
les vérifications suivantes de ce chantier ont été refaites en
capturant explicitement le code de sortie.
**Tests** : `npx tsc --noEmit`, exit code 0 vérifié explicitement à
chaque étape après correction du bug ci-dessus.
**Statut** : 🟠 IN PROGRESS — code complet pour la logique de base,
non commité, non déployé.
**Preuve** : `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section
"MISSION — Trusted Device / Device Enrollment". **Date** : 30/08/2026.

### Migrations en attente d'exécution, cumulées sur toute la journée du 30/08/2026

Dans l'ordre, à exécuter par Bryan un par un (demande explicite de
Bryan, "afficher les SQL 1 à 1" à la fin de ce chantier) — en plus de
`20260828000004_auth_security.sql` (Lot 2 sécurité, chantier initial du
28/08) déjà en attente depuis avant cette journée :

1. `20260830000001_session_revocation.sql` (amendée le jour même —
   institutions uniquement, plus admin_users)
2. `20260830000002_admin_sessions.sql`
3. `20260830000003_admin_logs_immuable.sql`
4. `20260830000004_trusted_device.sql`

**Statut mission** : rapport présenté, code prêt. En attente de la
revue SQL demandée par Bryan avant toute exécution/tout commit.

### DEC-2026-08-30-10 — Drift confirmé sur auth_security_events, corrigé avant impact

**Description** : en présentant les migrations une par une à Bryan
(demande explicite), `CREATE TABLE auth_security_events` a échoué —
"already exists". Diagnostic demandé plutôt que supposé : les 3 tables
existaient déjà réellement en base (24 lignes dans
`auth_security_events`), exécutées à un moment non documenté (jamais
annoté "exécuté par Bryan" dans le fichier, contrairement à la
convention du projet) — cohérent avec l'hypothèse que le code du 28/08,
jamais commité, avait été testé en local contre la même base Supabase
partagée (le projet n'a qu'un seul environnement de fait).
**Écart réel trouvé** (vérifié colonne par colonne et contrainte par
contrainte, pas supposé) : `endpoint_category` de la table réelle est
`NOT NULL` sans exception et n'accepte que les 5 valeurs d'origine —
`'admin_login'`/`'employee_login'`, ajoutées le 30/08 pour le code du
Lot 2, en étaient absentes. Le code d'aujourd'hui (admin/auth/login,
clock/auth/login) aurait donc échoué contre le vrai schéma.
`auth_device_security`/`auth_ip_security` vérifiées séparément — **aucun
écart**, correspondance exacte colonne par colonne.
**Correction** : nouveau fichier `20260830000005_auth_security_events_amendement.sql`
(2 `ALTER` ciblés, sans risque pour les 24 lignes existantes — élargit
des contraintes, n'en resserre aucune). `20260828000004_auth_security.sql`
annoté pour ne plus jamais être rejoué tel quel.
**Statut** : 🟢 VERIFIED — exécuté par Bryan en SQL Editor, confirmé.
**Date** : 30/08/2026.

**Migrations exécutées en séquence par Bryan (30/08/2026)** :
1. `20260830000005_auth_security_events_amendement.sql` — ✅ exécutée.
2. `20260830000001_session_revocation.sql` (`institutions.session_revoked_at`)
   — pré-vérifié absent (0 ligne), puis exécutée — ✅.
3. `20260830000002_admin_sessions.sql` — ✅ exécutée.
4. `20260830000003_admin_logs_immuable.sql` — ✅ exécutée (trigger
   d'immuabilité, GAP-06-07 clos).
5. `20260830000004_trusted_device.sql` — pré-vérifiée (les 3 colonnes
   déjà présentes sur `citoyen_remember_tokens`, `ip`/`device_label`/
   `last_used_at`, sont préexistantes depuis le 18/07/2026, hors périmètre
   de cette migration — aucune des colonnes réellement ajoutées par
   celle-ci n'existait) — ✅ exécutée.

**Les 5 migrations du 30/08/2026 sont maintenant toutes appliquées en
base.** GAP-10-01 (Auth Security), GAP-04-04 (révocation de session),
Mission Hardening Admin (points 5/7/8/9) et Mission Trusted Device
passent de "code prêt, migration non confirmée" à "code prêt, **couche
base de données live**". Le code applicatif correspondant (tous les
fichiers listés dans les 4 sections de ce document datées du 30/08)
reste non commité sur `main` et donc non déployé sur Netlify — la base
est prête à le recevoir, rien n'est encore actif en production tant que
le commit/déploiement n'a pas eu lieu.

---

## REVUE CRITIQUE + LOT 3 (30/08/2026, même jour)

### DEC-2026-08-30-11 — 6e migration : `20260830000006_institution_login_lockout.sql`

**Description** : trouvée pendant la revue critique (angle "comportement
supprimé") — le remplacement des verrous par compte PIN/OTP/WebAuthn
institution par le throttle device+IP avait supprimé toute protection
par compte sans la remplacer (contournable par rotation du cookie
device, entièrement côté client). Détail complet dans le gap analysis,
section "REVUE CRITIQUE + LOT 3".
**Statut** : 🟢 VERIFIED — colonnes confirmées en base avec le bon type
exact (`login_failed_attempts integer NOT NULL DEFAULT 0`,
`login_locked_until timestamptz` nullable), corrigeant une régression
réelle introduite le jour même avant tout déploiement. Exécutée à un
moment non explicitement confirmé dans l'échange (trouvée déjà présente
au moment de la vérification, comme `auth_security_events` plus tôt
dans la journée) — cohérent avec le rythme de la session, pas un
problème en soi tant que le résultat final est vérifié correct.
**Date** : 30/08/2026.

**Les 6 migrations du 30/08/2026 sont maintenant TOUTES confirmées en
base, avec vérification de type explicite pour chacune (pas seulement
l'existence des colonnes/tables).** Rien ne reste en attente côté SQL
pour la journée du 30/08/2026.

### DEC-2026-08-30-12 — Incident de process : faux-positif de vérification tsc

**Description** : pendant la revue critique, une vérification `tsc
--noEmit` lancée en arrière-plan a été considérée à tort comme réussie
(sortie vide lue avant la fin réelle du process, alors que la tâche
avait en réalité été tuée/interrompue). Bryan a signalé l'incohérence.
Un vrai bug (`statutPourNouvelleLigne` non défini, introduit pendant le
chantier Trusted Device) était passé inaperçu un instant à cause de
cette vérification prématurée.
**Correction de méthode** : toutes les vérifications suivantes de la
session ont été refaites en capturant explicitement le code de sortie
(`echo "EXIT_CODE=$?"` ou équivalent) et en attendant la notification
réelle de fin de tâche plutôt que de lire un fichier de sortie
potentiellement encore vide.
**Statut** : ✅ Clos — leçon de méthode appliquée pour le reste de la
session (build complet notamment, vérifié avec la même rigueur).
**Date** : 30/08/2026.

### DEC-2026-08-30-13 — `middleware.ts`/`proxy.ts` : conflit résolu

**Description** : `npm run build` a échoué — Next.js 16.2.1 refuse la
coexistence de `middleware.ts` et `proxy.ts`. Investigation (pas de
suppression à l'aveugle) : `proxy.ts` untracked par git, daté du
19/08/2026, contenu identique à `middleware.ts` d'alors (seul l'export
`middleware`→`proxy` diffère) — une tentative de migration vers la
nouvelle convention Next.js, commencée puis abandonnée avant d'être
commitée, jamais retouchée depuis (11 jours de retard sur les
corrections de sécurité).
**Correction** : contenu à jour de `middleware.ts` (avec toutes les
corrections du 30/08/2026) copié dans `proxy.ts`, seul l'export renommé.
`middleware.ts` supprimé.
**Statut** : ✅ Clos — `npm run build` confirmé propre ensuite (exit 0,
zéro warning, 321+ routes, `proxy.ts` reconnu comme middleware).
**Date** : 30/08/2026.

### DEC-2026-08-30-14 — Revue critique : 8 trouvailles corrigées

Voir détail complet (8 corrections + dette documentée non corrigée) dans
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section "REVUE CRITIQUE
+ LOT 3". Résumé des 2 plus sérieuses : (1) révocation de session
contournable sur 9 routes institution qui gardaient une vérification
d'auth locale jamais mise à jour ; (2) régression réelle du
verrouillage par compte PIN/OTP/WebAuthn institution (voir
DEC-2026-08-30-11). Les 6 autres : `middleware.ts` ne vérifiait jamais
`admin_sessions`, `auth-security/unblock` sans réauthentification
(trouvé indépendamment 4 fois), erreurs Supabase avalées silencieusement
dans `lib/security/authSecurity.ts`, course `iat`/`revoked_at` dans
`institution/remember/revoke-all`, 3 derniers Maps mémoire résiduels
migrés, une incohérence entre mon propre commentaire et le code réel.
**Statut** : ✅ Clos — `tsc`/build propres après corrections.
**Date** : 30/08/2026.

### DEC-2026-08-30-15 — Lot 3 : Authorization/RBAC/ABAC (audit)

**Description** : suite du master plan (section 05). Matrice institution
(`lib/institutionPermissions.ts`) relue intégralement — 🟢 VERIFIED,
mature, rien à corriger. Couverture systématique vérifiée (script) :
0 route d'écriture institution/admin sans vérification d'auth. 5 routes
citoyen signalées, toutes légitimes (3 publiques documentées, 2 routes
de connexion WebAuthn — c'est le mécanisme d'auth lui-même, forcément
pré-auth) : les 2 dernières avaient le Map mémoire résiduel, corrigé
dans la revue critique ci-dessus.
**Non fait, périmètre restant** : audit IDOR exhaustif ligne par ligne
des ~219 routes (Lot 1 avait déjà vérifié 12 cas, non ré-audité à 100%
ici — seule la présence d'une vérification a été confirmée
systématiquement, pas le scoping exact par tenant de chaque requête).
**Statut** : 🟡 NEEDS REVIEW pour l'IDOR exhaustif (non bloquant, aucun
signal trouvé d'un vrai problème) — reste du Lot 3 clos.
**Date** : 30/08/2026.

**Statut journée du 30/08/2026** : Lot 2 (Identity, étendu), Mission
Hardening Admin, Mission Trusted Device, revue critique complète, et
Lot 3 (RBAC, audit) tous traités le même jour. 6 migrations exécutées
et vérifiées en base par Bryan. `tsc --noEmit` et `npm run build` tous
deux propres (build complet vérifié pour la première fois ce jour).
**Aucun commit, aucun déploiement** — décision de Bryan à suivre pour
la suite (commit scopé à revoir ensemble, test réel en navigateur avant
tout déploiement, ou Lot 4 du master plan).

---

## ADMIN ENTRY SECURITY V2 — implémentation + premiers tests réels (31/08/2026)

Note de recadrage : ce "Lot 3" est la numérotation propre au mini-chantier
Admin Entry (`docs/security/YELEN_ADMIN_ENTRY_V2_DECISION.md`), distincte
du "Lot 3" du master plan (section 05, RBAC, clos le 30/08 ci-dessus). Les
deux portent le même nom par coïncidence de séquençage le même jour —
noté ici explicitement pour ne pas confondre les deux au prochain audit.

### DEC-2026-08-31-01 — Constat : implémentation complète, jamais documentée ni commitée

**Description** : `YELEN_ADMIN_ENTRY_V2_AUDIT.md`/`_DECISION.md` (30/08)
concluaient tous deux "zéro implémentation, en attente de validation
CEO". Vérification réelle du code ce soir (31/08) : l'implémentation
complète existe sur disque, jamais annotée dans ce document ni commitée.
**Preuve (lecture directe, pas supposée)** :
- 7 routes `app/api/admin/entry/webauthn/{auth-options,auth-verify,
  register-options,register-verify,list,rename,revoke}/route.ts`.
- `lib/adminEntry.ts` (grant : token aléatoire 32 octets, seul le hash
  SHA-256 stocké, TTL 20 min, secret de challenge dédié
  `ADMIN_ENTRY_WEBAUTHN_JWT_SECRET` — jamais `ADMIN_JWT_SECRET`, conforme
  à la décision section 1/5).
- Migration `20260830000010_admin_entry_v2_foundation.sql` : 5 tables
  (`admin_entry_webauthn_credentials`, `admin_entry_grants`,
  `auth_admin_entry_device_security`, `auth_admin_entry_ip_security`),
  RLS activé sans policy sur les 4 — **exécutée en base**, confirmée par
  requêtes directes ce soir (credential réel présent, tables de throttle
  peuplées par les tests ci-dessous).
- `proxy.ts` (lignes 371-384) : grant WebAuthn valide et
  `ADMIN_ENTRY_TOKEN` cohabitent par **OU**, exactement comme décidé
  section 6 — un grant seul ne lève que le 404 muet sur `/admin/*`,
  jamais accepté par la vérification JWT/`admin_sessions` qui suit.
- `lib/security/authSecurity.ts`/`lib/adminAuth.ts` : modifiés (staged),
  `TABLES_ADMIN_ENTRY` confirmé présent.
**État git** : tout non commité — `app/api/admin/entry/`,
`lib/adminEntry.ts`, `proxy.ts`, la migration : untracked (`??`) ;
`lib/adminAuth.ts`, `lib/security/authSecurity.ts` : modifiés staged
(`AM`). Cohérent avec le reste du chantier sécurité du 30/08 (rien de la
journée n'a été commité).
**Statut** : 🟠 IN PROGRESS — code complet et fonctionnel en local,
migration vivante en base, zéro ligne committée/déployée.
**Date** : 31/08/2026.

### DEC-2026-08-31-02 — Tests réels exécutés ce soir contre les 11 tests de la décision (section 7)

**Test 1 (Succès WebAuthn) — partiellement couvert** : pas rejoué de
bout en bout ce soir, mais la preuve indirecte est réelle — un
credential (`device_label: "Byan appariell"`) affiche `counter = 3`,
`last_used_at` récent, ce qui n'est atteignable qu'après 3
authentifications WebAuthn réussies en conditions réelles (le compteur
n'avance que sur un succès `verifyAuthenticationResponse`). Anti-rejeu
par compteur confirmé opérant pour ce matériel précis (Windows Hello) —
réserve documentée : un authentificateur qui resterait bloqué à 0
compteur s'appuierait uniquement sur l'expiration du challenge (5 min,
`lib/adminEntry.ts`), pas testé séparément.

**Test 8 (Lockout isolé) — passé** : 4 tentatives avec credential
inexistant → 423 Locked dès la 1ère requête suivante (blocage déjà actif
d'un essai précédent la même nuit), confirmé persistant à travers un
redémarrage complet du PC (état en base, pas en mémoire de processus).
Isolation vérifiée par requête directe sur les 3 tables `*_ip_security` :
`auth_admin_entry_ip_security` bloqué avec `blocked_until` dans le futur
par rapport à `now()` (blocage sain, pas périmé) ; `auth_admin_ip_security`
resté `warning`/`null` (non affecté) ; `auth_ip_security` a gardé un état
`blocked` préexistant, antérieur à ce test et non modifié par lui. Les
3 scopes de throttle (`admin_entry`/`admin_login`/citoyen) sont bien
cloisonnés — aucun effet croisé observé.

**Non exécutés ce soir, restent ouverts** : tests 2 (credential inconnu
→ 404 générique), 3 (credential révoqué), 4 (grant expiré), 5 (grant
révoqué manuellement), 6 (grant seul sans auth admin ensuite → aucun
accès), 7 (double-usage concurrent du même grant), 9 (second credential
de récupération), 10 (absence de fuite dans les logs/réponses/URLs),
11 (`/api/admin/*` avec le seul grant, sans session, doit être rejeté).

**Condition de bascule non remplie** : décision section 3 exige **au
moins 2 credentials WebAuthn d'entrée distincts, vérifiés fonctionnels**
avant tout retrait de `ADMIN_ENTRY_TOKEN`. Un seul credential existe en
base ce soir (`ed52d126-...`, "Byan appariell") — `ADMIN_ENTRY_TOKEN`
reste donc le seul filet de récupération tant qu'un 2e credential n'est
pas enregistré et testé.
**Statut** : 🟠 IN PROGRESS — 2/11 tests de la spécification passés
(1 partiel, 1 complet), 9 restants, condition de bascule V1→V2 non
remplie.
**Preuve** : requêtes SQL directes exécutées par Bryan ce soir sur
`admin_entry_webauthn_credentials`, `auth_admin_entry_ip_security`,
`auth_admin_ip_security`, `auth_ip_security`. **Date** : 31/08/2026.

**Prochaine reprise** : soit continuer la suite des 9 tests restants
(ordre suggéré : 6 et 11 en premier — ce sont les deux qui vérifient que
le grant ne peut structurellement jamais devenir une session admin,
donc les plus critiques avant tout commit), soit enregistrer le 2e
credential de récupération (condition de bascule), au choix de Bryan.
Aucun commit, aucun déploiement fait ce soir.

### DEC-2026-08-31-03 — Tests 6 et 11 passés, preuve directe navigateur

**Test 6 (grant utilisé sans authentification admin ensuite)** : vérification
WebAuthn réelle réussie sur `/entree-admin` → grant émis → navigation
directe vers 3 écrans distincts sous `/admin/*` (dont `/admin/security`,
confirmé par l'URL `admin/login?redirect=%2Fadmin%2Fsecurity` capturée) :
les 3 redirigent systématiquement vers `/admin/login`, jamais le
dashboard. Le grant seul ne mène nulle part au-delà de la page de login,
conforme à la conception.

**Test 11 (`/api/admin/*` avec le seul grant, sans session)** : `GET
/api/admin/kpis` avec uniquement le cookie `yelen224_admin_entry_grant`
présent (aucun `yelen224_admin_session`) → `401 Unauthorized`,
`{"error":"Non autorisé","code":"NO_SESSION"}` — capturé en entier dans
l'onglet Network (en-têtes de réponse incluant CSP/HSTS/Permissions-Policy
cohérents avec le reste du site). Le grant n'est reconnu par aucune route
API admin, exactement la garantie recherchée.

**Observation annexe (pas un défaut)** : le cookie de grant apparaît en
clair dans les en-têtes de requête visibles depuis l'onglet Network du
navigateur qui l'envoie — comportement normal pour tout cookie httpOnly
(visible par le navigateur propriétaire, jamais par JavaScript côté page
ni par un tiers), ne remet pas en cause le test 10 (absence de fuite vers
un tiers/logs serveur/URL).

**Statut mis à jour** : 4/11 tests de la spécification passés (1 partiel,
6, 8, 11 — les 2 plus critiques désormais confirmés). Restent : 2, 3, 4,
5, 7, 9, 10.
**Preuve** : capture d'écran DevTools Network (`/api/admin/kpis`, 401),
capture URL de redirection (`/admin/login?redirect=%2Fadmin%2Fsecurity`).
**Date** : 31/08/2026.

### DEC-2026-08-31-04 — RAPPORT DE VALIDATION LOT 3 : les 11 tests évalués, clôture

**Cadre** : consigne explicite de Bryan — validation uniquement, zéro
implémentation supplémentaire, ne jamais corriger un écart trouvé sans
décision CEO, ne jamais afficher/enregistrer une valeur brute de
cookie/credential/secret/challenge/token. Toutes les valeurs manipulées
ce soir sont restées des identifiants (`id` uuid) ou des hash — jamais un
`cookie_hash` ni une valeur de cookie brute écrits dans ce document ou
demandés à Bryan.

**Résultat** : 9 PASS, 1 PARTIAL, 1 BLOCKED, 0 FAIL. Table complète
(preuve + fichier/route par test) dans `docs/security/
YELEN_ADMIN_ENTRY_V2_DECISION.md`, section "RAPPORT DE VALIDATION LOT 3".

**Les 2 écarts réels trouvés, non corrigés (décision CEO requise)** :
1. **Test 2** : `auth-verify` renvoie `401 CREDENTIAL_NOT_FOUND` (JSON
   structuré) pour un credential inconnu, alors que la spec d'origine
   (section 7 de la décision) prévoyait un `404 générique` façon route
   inexistante. Le fond de l'exigence est respecté (inconnu et révoqué
   sont indiscernables, Test 3), seule la forme diverge. Risque estimé
   faible (`/entree-admin` est un chemin public par conception, pas un
   secret — voir section 2 de la décision), mais c'est un écart entre le
   document approuvé et le code livré, à trancher explicitement.
2. **Test 7** : `admin_entry_grants.consumed_at` n'est écrit par aucune
   route du code (`app/api/admin/entry/**`, `lib/adminEntry.ts`,
   `proxy.ts` — recherche exhaustive). La conception (section 4 de la
   décision) prévoyait que le grant soit marqué consommé dès
   l'établissement d'une vraie session `admin_sessions`. En l'état, un
   grant reste valable pour atteindre `/admin/login` un nombre illimité
   de fois pendant ses 20 minutes. **Ne remet pas en cause la propriété
   critique déjà prouvée (Tests 6, 11)** : le grant seul ne peut
   structurellement accéder à aucune page/route protégée au-delà de
   `/admin/login` — mais c'est un écart de conception non implémenté, pas
   une simple note.

**Tests live exécutés ce soir avec preuve directe** (au-delà de ceux déjà
actés en DEC-2026-08-31-02/03) :
- **Test 4** : `expires_at` d'un grant réel forcé dans le passé par SQL
  (`UPDATE admin_entry_grants SET expires_at = now() - interval '1
  minute' WHERE id = ...`) → rechargement navigateur → 404 muet immédiat
  (page "ERREUR 404 · PAGE INTROUVABLE"), jamais un état intermédiaire.
- **Test 5** : nouveau grant réel émis (vérification WebAuthn réussie),
  révoqué manuellement par SQL (`revoked_at = now()`) → rechargement
  immédiat → même 404 muet, aucun délai de propagation observé.
- **Test 3** : conclusion directe des deux tests ci-dessus — expiration
  et révocation produisent toutes deux un état non réutilisable,
  indiscernable d'une route inexistante.
- **Test 9** : marqué BLOCKED sur confirmation explicite de Bryan
  (absence de second authentificateur physique ce soir) — pas un échec,
  reste la condition bloquante pour tout retrait de `ADMIN_ENTRY_TOKEN`.

**Statut** : ✅ **Lot 3 (validation) clos** — 11/11 tests évalués (9
PASS/1 PARTIAL/1 BLOCKED). Conforme à la consigne : aucune correction
appliquée, aucun fichier modifié hors documentation. **En attente de
décision CEO** sur les 2 écarts avant tout code supplémentaire. Prochaine
étape actée avec Bryan : commit **local uniquement** (pas de push) une
fois cette décision prise, pour sécuriser le travail sans déclencher de
déploiement.
**Preuve** : requêtes SQL et captures navigateur fournies par Bryan en
direct, détail complet dans `YELEN_ADMIN_ENTRY_V2_DECISION.md`.
**Date** : 31/08/2026.

### DEC-2026-08-31-05 — Corrections des 2 écarts (Écart 1, Écart 2), code + tsc propres

**Cadre** : décision CEO explicite, périmètre strictement limité aux 2
écarts du rapport DEC-2026-08-31-04, méthode imposée (audit du code
réel avant modification, changement minimal, aucune correction non
demandée, rapport PASS/PARTIAL/FAIL uniquement en sortie).

**3 fichiers modifiés** (signalé et confirmé avec Bryan avant de
commencer — dépasse la règle "2 fichiers max", justifié par
l'architecture existante déjà documentée : lecture en middleware Edge
vs écriture en route API Node, deux contextes d'exécution qui ne
peuvent pas être fusionnés sans casser la séparation grant/session déjà
actée dans le code) :
1. `app/api/admin/entry/webauthn/auth-verify/route.ts` — Écart 1.
2. `proxy.ts` — Écart 2, lecture (`consumed_at` ajouté au contrôle de
   validité de `verifierGrantEntreeAdmin()`).
3. `app/api/admin/auth/login/route.ts` — Écart 2, écriture (consommation
   atomique du grant à la transition réussie vers une session admin).

Détail technique complet, ligne par ligne, dans `docs/security/
YELEN_ADMIN_ENTRY_V2_DECISION.md`, section "CORRECTIONS DE CONFORMITÉ".

**Décision de scope notée explicitement** : `COUNTER_REGRESSION` (anti-
rejeu WebAuthn) laissé en dehors de l'uniformisation Écart 1 — ce n'est
pas un des 3 cas nommés par la décision CEO ("credential inconnu,
credential révoqué, assertion invalide"), et c'est structurellement
différent (l'assertion y est cryptographiquement valide, c'est un rejeu
détecté après coup) — pas une omission, une lecture stricte du périmètre
donné.

**Tests** : `npx tsc --noEmit` sur les 3 fichiers → **exit 0**, confirmé
par notification de fin de tâche explicite (pas une lecture de sortie
anticipée — ~40 minutes de compilation sur cette machine, chargée par
plusieurs process Node simultanés, leçon de méthode du 30/08 appliquée
correctement cette fois).

**Non fait ce soir, explicitement** : la suite de revalidation demandée
par Bryan (rejouer credential inconnu/révoqué, deux usages successifs du
même grant, deux requêtes concurrentes, grant consommé → échec attendu,
`/api/admin/*` toujours inaccessible avec le grant seul, `admin_sessions`
inchangée, recherche de régression sur les 7 tests déjà PASS) nécessite
la participation directe de Bryan (navigateur + SQL) — non disponible au
moment de la fin de la compilation. Protocole prêt, à exécuter à sa
prochaine disponibilité.
**Statut** : 🟠 IN PROGRESS — code corrigé, type-vérifié, **non
revérifié en conditions réelles**. Aucun commit, conforme à la consigne
"attendre une nouvelle décision" avant de considérer le Lot 3 clos.
**Date** : 31/08/2026.

### DEC-2026-08-31-06 — Revalidation live des Écarts 1 et 2, confirmée en conditions réelles

**Description** : après redémarrage machine, Bryan exécute le protocole
de revalidation en 4 étapes laissé en attente par DEC-2026-08-31-05.
**Résultat** : les 4 étapes passent. Credential inconnu/révoqué →
réponse identique confirmée en direct (Écart 1). Vérification WebAuthn
réelle → grant émis → connexion admin réelle (mot de passe + TOTP) →
`admin_entry_grants.consumed_at` rempli juste après (`revoked_at` null,
consommé ~18 min avant `expires_at`) — **Écart 2 confirmé fonctionnel en
conditions réelles**, pas seulement type-vérifié comme au lot précédent.
**Contrôle** : aucune valeur brute de cookie/credential/secret manipulée
ni redemandée à Bryan, conforme à la contrainte permanente de ce
chantier.
**Statut** : ✅ **Écarts 1 et 2 clos**, y compris en conditions réelles.
**Preuve** : `docs/security/YELEN_ADMIN_ENTRY_V2_DECISION.md`, section
"CORRECTIONS DE CONFORMITÉ" mise à jour. **Date** : 31/08/2026.

### DEC-2026-08-31-07 — Trouvaille post-clôture : bypass du garde-fou `/admin/login` par cookie forgé, corrigé

**Description** : à la demande de Bryan ("fais une revue critique toi-même,
pas un agent"), lecture complète de `proxy.ts` (hors périmètre des 11
tests de la spec Lot 3, qui testent le grant lui-même, pas la condition
qui déclenche son exigence). Trouvaille : le garde-fou grant/token ne
testait que la **présence** du cookie `yelen224_admin_session`
(`!request.cookies.get(...)?.value`), jamais sa validité.
**Risque** : un client HTTP direct (curl/Burp, aucun navigateur requis)
envoyant `Cookie: yelen224_admin_session=n'importe-quoi` sautait le
garde-fou entièrement et atteignait `/admin/login`
(`PUBLIC_ADMIN_ROUTES`) normalement, **sans jamais vérifier le JWT** —
défaisait complètement l'obscurcissement de la console admin (section 1
du brief "Sécurisation de l'accès Administration", 30/08/2026), sans
connaître `ADMIN_ENTRY_TOKEN` ni posséder de credential WebAuthn. Les
autres pages `/admin/*` restaient protégées (JWT vérifié plus loin dans
le même fichier) — seule la route publique de login était exposée par ce
chemin précis.
**Contrôle/correction** : `proxy.ts` calcule désormais la validité réelle
de la session (`verifierTokenAdmin()`) **une seule fois**, dès l'entrée
dans le bloc `/admin/*`, réutilisée pour le garde-fou grant/token ET la
vérification JWT normale plus bas (zéro double appel). Le garde-fou se
base sur `!sessionAdmin.valide` au lieu de la présence du cookie.
**Compromis assumé** (décision explicite de Bryan — "assure-toi en toute
prudence et sécurité") : un JWT présent mais expiré/révoqué tombe
désormais aussi sous le garde-fou (404 muet si pas de grant/token valide)
au lieu d'un redirect direct vers `/admin/login` — sécurité priorisée sur
le confort.
**Tests** : `npx tsc --noEmit` → 0 erreur. `npx eslint proxy.ts` → 0
erreur/warning (2 runs, confirmés par notification de tâche). **Non
retesté en conditions réelles** (garbage cookie, session valide, entrée
par token) — à faire avant tout push.
**Statut** : 🟡 NEEDS REVIEW — correctif appliqué et type/lint-vérifié,
commité **localement uniquement** (`a1e1d9c`, aucun push). Commits de
sauvegarde locaux associés au même chantier : `903d7ca` (snapshot de
l'accumulation de chantiers en cours, ~650 fichiers, demandé
explicitement par Bryan après redémarrage machine) et `45e585b` (retrait
de 7 fichiers de debug glissés par erreur dans ce snapshot).
**Preuve** : `docs/security/YELEN_ADMIN_ENTRY_V2_DECISION.md`, section
"TROUVAILLE POST-CLÔTURE". **Date** : 31/08/2026.

---

### DEC-2026-08-31-08 — LOT 4 : Database & Storage Security (audit)

**Description** : suite du master plan après la clôture du Lot 3
(section 40) — Bryan hors domicile, aucun accès SQL Editor/navigateur
disponible. Audit en lecture seule des items restants de la section 06
(vues, triggers, extensions) et premier passage sur la section 11
(Storage), sans exécution SQL ni modification de code.
**Résultat vues/triggers/extensions** : 🟢 VERIFIED — 0 vue, 20 triggers
inventoriés (13 immuabilité + 7 logique métier, tous cohérents avec les
patterns déjà connus), 2 extensions seulement (`pg_cron`/`pg_net`,
usage justifié). Rien à corriger.
**Nouvelle constatation (GAP-11-01)** : inventaire de 12 buckets Storage
référencés dans le code, croisé avec `getPublicUrl`/`createSignedUrl`
utilisés par chaque route. 3 buckets contenant des données sensibles
(`recus-paiement`, `documents-travail`, `messagerie-images`) doivent
être **Privés** d'après l'usage du code lui-même, mais n'ont **jamais**
été mentionnés dans la checklist manuelle de vérification des buckets
(contrairement aux 4 autres buckets privés déjà connus) — statut
Public/Privé réel jamais confirmé, réglage dashboard hors du code
(NOT VERIFIED).
**Risque** : si l'un des trois est resté Public, `createSignedUrl()`
donne une fausse impression de contrôle d'accès — le fichier reste lisible
via l'URL publique du bucket sans jamais passer par la signature.
**Contrôle** : aucun (audit uniquement) — ajouté à la checklist
`/actions-manuelles-en-attente` de CLAUDE.md pour vérification par Bryan
au prochain accès dashboard.
**Statut** : 🟡 NEEDS REVIEW (GAP-11-01) — reste du Lot 4 🟢 VERIFIED.
**Correction annexe** : GAP-06-07 (résumé exécutif du gap analysis)
corrigé de 🟡 à 🟢 VERIFIED & CORRIGÉ — resté à tort non mis à jour depuis
le 16/08 alors que le trigger `admin_logs_immuable` est confirmé en base
depuis le 30/08 (Mission 2 Hardening Admin, DEC-2026-08-30-11).
**Non fait** : GAP-06-08 (grants trop larges, resserrement par migration
à rédiger) laissé pour un lot dédié, aucune priorité tranchée par Bryan
sur ce point précis.
**Preuve** : `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section
"LOT 4 — DATABASE & STORAGE SECURITY". **Date** : 31/08/2026.

**Statut journée du 31/08/2026 (suite)** : Admin Entry V2 (bypass
proxy.ts corrigé, commité localement, en attente de retest réel) + Lot 4
(audit Database/Storage, GAP-11-01 nouveau) traités. Aucun commit sur ce
Lot 4 (documentation uniquement, zéro fichier de code touché). Rapport
présenté, pas de Lot 5 avant validation de Bryan.

---

### DEC-2026-08-31-09 — LOT 4 (suite) : GAP-08-01 corrigé, centralisation de l'auth citoyen

**Description** : sur demande explicite de Bryan (lancement imminent,
"corrige, pas seulement documente"), seul GAP-08-01 était un correctif de
code faisable sans SQL/dashboard/navigateur parmi tout ce qui restait
ouvert. Nouveau `lib/citoyenAuth.ts::verifierCitoyenToken()`, 44 routes
`app/api/citoyen/**` basculées, zéro changement de comportement externe
(même texte/code/statut HTTP par route, préservés un par un). Détail
complet, liste exhaustive des 44 fichiers, et justification de chaque
choix de conception dans `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`,
section "LOT 4 (suite)".
**Risque avant** : logique de vérification dupliquée 44 fois — un futur
correctif de sécurité sur ce point (ex. blacklist de token, log
centralisé) aurait dû être répété 44 fois avec un vrai risque d'oubli
partiel.
**Contrôle** : point d'entrée unique, `tsc --noEmit` exit 0 confirmé par
code de sortie explicite (pas une lecture anticipée).
**Exception au protocole** : 45 fichiers modifiés en une fois (largement
au-delà de "2 fichiers max") — exception explicitement demandée et
accordée par Bryan pour ce chantier précis, pas une dérive silencieuse.
**Statut** : 🟠 IN PROGRESS — code prêt, **non commité, non testé en
conditions réelles** (aucun navigateur disponible ce soir). Bryan doit
naviguer les parcours citoyen principaux (connexion, Mes RDV, Favoris,
Sécurité, Confidentialité) avant tout commit/push.
**Preuve** : `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section
"LOT 4 (suite)". **Date** : 31/08/2026.

---

### DEC-2026-09-01-01 — GAP-06-09 (Critical) : fuite `mot_de_passe_hash` public, corrigée

**Description** : trouvé incidemment pendant l'audit Phase 0 "Booking
externe" (mission séparée, `docs/product/YELEN_BOOKING_EXTERNAL_INTEGRATION_PHASE0.md`) —
`InstitutionPublicClient.tsx:586` faisait `select("*")` sur `institutions`
avec le client anon. RLS filtre par ligne (`institutions_public_read`,
`statut='validee'`), jamais par colonne — `mot_de_passe_hash` était donc
renvoyé en clair (haché, mais toujours une donnée d'authentification)
dans la réponse JSON de chaque fiche publique, sans authentification,
indépendamment de toute intégration externe.
**Risque** : identifiant de connexion institution exposé publiquement,
exploitable par simple lecture réseau, aucune barrière.
**Contrôle/correction** : `select()` explicite limité aux colonnes
réellement consommées, chaque nom vérifié individuellement (recoupement
avec 2 `select()` déjà en production ailleurs + migrations réelles) pour
ne jamais casser la requête. 3 colonnes très récentes (migration
`20260831000001`, untracked, exécution non confirmée) d'abord exclues
par prudence, **réintégrées le même jour** après confirmation de Bryan
que la migration a bien été exécutée. Détail complet dans
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section "GAP-06-09".
**Statut** : 🟢 CORRIGÉ, `tsc --noEmit` exit 0 (×2) — **non commité, non
testé en navigateur réel**. Action requise de Bryan : recharger une
fiche publique et vérifier dans l'onglet Réseau que `mot_de_passe_hash`
a disparu, et que l'affichage (dont les dates "Écrit le" du popup
Conditions/Informations) est correct, avant tout commit/déploiement.
**Preuve** : `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section
"GAP-06-09". **Date** : 01/09/2026.

---

### DEC-2026-09-01-02 — Revue critique express, posture "pour toujours" (audit uniquement)

**Description** : demande explicite de Bryan — revue critique de tout le
système, mode expert cybersécurité, standard visé Amazon/Facebook.
**Aucune correction dans cette phase**, fait personnellement (pas
d'agent). Détail complet dans
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section "REVUE CRITIQUE
EXPRESS".
**2 nouveaux gaps applicatifs trouvés** : GAP-04-05 (secret de repli
codé en dur sur `QR_SECRET_KEY`, High si la variable venait à manquer
sur un environnement réel) et GAP-08-02 (aucune validation serveur
créneau/capacité/institution à la création d'un RDV, Medium-High —
recoupe une lacune déjà documentée dans la Phase 0 Booking externe).
**Escalade** : nouvelle CVE Next.js non trackée jusqu'ici
("Unauthenticated disclosure of internal Server Function endpoints",
GHSA-955p-x3mx-jcvp) sur `npm audit` réel de ce soir — directement
pertinente vu l'usage massif de Server Actions dans ce projet, augmente
la priorité de l'upgrade `next` déjà en attente (GAP-14-01).
**Reconfirmé sain** : zéro secret dans Git, `.gitignore` correct, zéro
`dangerouslySetInnerHTML`, `lib/uploadSecurity.ts` mature (magic bytes
réels, jamais `file.type`/extension client).
**Constat honnête de dette structurelle** (pas des gaps applicatifs,
des fondations jamais construites) : observabilité/alerting,
sauvegardes jamais testées, aucun runbook de reprise après sinistre,
WAF Cloudflare toujours pas déployé, secrets en variables
d'environnement brutes sans rotation, facteur bus (un seul développeur),
zéro SAST/DAST en CI, zéro canal de disclosure de vulnérabilité.
**Solution proposée** : liste priorisée immédiat/moyen terme/long terme
dans le gap analysis — rien implémenté, uniquement proposé.
**Statut** : GAP-04-05 et GAP-08-02 🟢 **corrigés le même soir** (Bryan :
"Corige d'abord") — voir DEC-2026-09-01-03. Le reste (observabilité/DR/
secrets/organisation) reste un constat structurel, pas une action à
trancher immédiatement.
**Preuve** : `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section
"REVUE CRITIQUE EXPRESS". **Date** : 01/09/2026.

---

### DEC-2026-09-01-03 — GAP-04-05 et GAP-08-02 corrigés

**Description** : sur demande de Bryan ("Corige d'abord"), les 2 gaps
applicatifs trouvés pendant la revue critique express sont corrigés
avant tout commit.
**Correctifs** : (1) `app/api/qr/generate/route.ts` — suppression du
secret de repli codé en dur sur `QR_SECRET_KEY`, échec explicite si
absent. (2) `app/rdv/[id]/actions.ts` — nouvelle fonction
`validerCreneauServeur()` dans `createRdv` : institution
existe/validée, créneau cohérent avec `disponibilites` (fenêtre 28
jours, identique au wizard), capacité non dépassée. Détail technique
complet dans `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section
"REVUE CRITIQUE EXPRESS".
**Test** : `npx tsc --noEmit` → exit 0.
**Statut** : 🟢 CORRIGÉ (code), **non commité, non testé en conditions
réelles** — Bryan doit valider en navigateur (réservation valide
acceptée, créneau complet/hors disponibilités refusé) avant tout
commit/push.
**Preuve** : `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section
"REVUE CRITIQUE EXPRESS". **Date** : 01/09/2026.

---

### DEC-2026-09-12-01 — GAP-10-01 : correctif du contournement de rate limiting (`trouve`/`code_envoye`) + 3 tests de régression

**Description** : dans le cadre de la revue de sécurité complète
demandée par Bryan, reprise de la session en cours (non commitée) sur
`lib/security/authSecurity.ts`. 2 bugs réels confirmés en la testant :
(1) 03/09 — un succès comptait comme une tentative, bloquant un citoyen
légitime dès sa 3e connexion correcte en 15 min ; (2) 12/09 — le
correctif du 03/09 avait classé `trouve`/`code_envoye` (étapes
préalables à toute vérification) comme des succès, permettant à un
attaquant de neutraliser complètement l'escalade en rappelant
`lookup`/`send-otp` en boucle sans jamais tenter de code. Détail complet
(cause/impact/correctif) dans
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section "MISE À JOUR —
12/09/2026".
**Correctif** : `OUTCOMES_SUCCES` restreint aux 4 outcomes qui prouvent
réellement une identité (`code_correct`, `compte_cree`, `demande_creee`,
`verification_ok`) ; `trouve`/`code_envoye` retombent dans le chemin
échec normal.
**Test** : 13 tests vitest (`lib/security/authSecurity.test.ts`, 10
préexistants + 3 nouveaux couvrant explicitement l'exploit du 12/09, la
préservation de `block_cycles_24h` après succès, et la non-régression du
flux légitime) → 13 passed. `npx tsc --noEmit` sur tout le projet →
exit 0.
**Statut** : 🟠 IN PROGRESS — correctif testé unitairement, prêt pour
commit dédié. Déploiement réel toujours bloqué sur les 3 mêmes
conditions que GAP-10-01 depuis le 30/08 (migration
`20260828000004_auth_security.sql` non confirmée exécutée, chantier
`authSecurity.ts` non commité dans son ensemble, aucune vérification en
production). **Aucun test en conditions réelles** (navigateur/Supabase
réel) — dépend de la confirmation de la migration.
**Preuve** : `lib/security/authSecurity.ts`,
`lib/security/authSecurity.test.ts`, sortie vitest/tsc ci-dessus.
**Date** : 12/09/2026.

---

### DEC-2026-09-13-01 — GAP-05-01 + GAP-07-01 : contrôle d'autorisation serveur manquant sur `/api/qr/validate`, corrigé en P0

**Description** : trouvés en marge de la conception du chantier "YELEN
Accueil" (check-in mobile isolé du dashboard, voir
`docs/security/YELEN_ACCUEIL_CHECKIN_DESIGN.md`) pendant l'audit du code
réel de `app/api/qr/validate/route.ts` avant réutilisation. 2 gaps
distincts dans la même route : (1) GAP-05-01 — aucune vérification de rôle
serveur, seul le masquage de l'onglet "Scanner" empêchait un membre
comptable/superviseur/dirigeant d'appeler la route directement ; (2)
GAP-07-01 — le POST chargeait le RDV sans filtre `institution_id`,
faisant reposer l'isolation multi-tenant sur un champ du payload JSON
fourni par le client (falsifiable), contrairement au PUT de la même route
qui avait ce filtre depuis l'origine.
**Décision de Bryan** : "P0, ne pas attendre une validation
supplémentaire" — corrigé immédiatement, sans étape de conception
préalable contrairement au reste du protocole habituel.
**Correctif** : nouvelle clé RBAC `appointment.check_in`
(`lib/institutionPermissions.ts`, `{ admin: true, agent: true }`,
identique à `TAB_MATRIX.scanner`) ; vérifiée en tête des deux handlers
`POST`/`PUT` de `app/api/qr/validate/route.ts`, avant toute lecture du
RDV ; ajout du filtre `.eq("institution_id", membre.institutionId)`
manquant sur la requête POST.
**Test** : 10 tests vitest (`app/api/qr/validate/route.test.ts`) couvrant
les 6 scénarios demandés (401 non authentifié, 403 rôle non autorisé sans
fuite, 200 agent autorisé, 404 générique cross-institution même avec
payload falsifié, cohérence sur QR déjà validé, non-influence des champs
du body sur l'identité). Détail complet dans
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`, section "GAP-05-01 /
GAP-07-01".
**Statut** : 🟢 CORRIGÉ (code), **non commité, non testé en conditions
réelles**. Bryan doit exécuter `npx vitest run
app/api/qr/validate/route.test.ts` et `npx tsc --noEmit` avant tout
commit — ni l'un ni l'autre n'a été lancé par Claude Code sur ce projet
(règle du projet : aucune commande terminal sans validation explicite).
**Preuve** : `lib/institutionPermissions.ts`,
`app/api/qr/validate/route.ts`, `app/api/qr/validate/route.test.ts`,
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`. **Date** : 13/09/2026.

---

### DEC-2026-09-13-02 — YELEN Accueil (check-in mobile) implémenté de bout en bout, sur les arbitrages produit de Bryan

**Description** : suite au correctif P0 ci-dessus, Bryan a tranché les 8
points ouverts de la conception initiale
(`docs/security/YELEN_ACCUEIL_CHECKIN_DESIGN.md`) et demandé
l'implémentation complète en une passe ("continue de bout en bout").
Détail des arbitrages retenus dans la section "MISE À JOUR — 13/09/2026"
du document de conception — résumé : route `/check-in/{slug}`, pas de QR
Agent en V1 (identifiant court + PIN, même credential que le dashboard),
session dédiée 8h max / verrou d'inactivité 2 min, code manuel de secours
pour RDV gratuits, réponse API minimale (prénom + initiale, jamais
téléphone), historique limité à la session en cours, aucune validation
offline en V1.
**Livré** : 2 migrations (`checkin_sessions` + `rdv.code_secours`,
extension `auth_security_events`), `lib/checkinAuth.ts` (session dédiée,
JWT/cookie/secret distincts de `institutionAuth.ts`/`employeeAuth.ts`),
extraction de `lib/qrValidation.ts` (règles de scan/confirmation partagées
entre `/api/qr/validate` et les nouvelles routes `/api/checkin/*` — un
seul point de vérité, cf. GAP-05-01/07-01 ci-dessus), 6 routes
`/api/checkin/*`, extension de `/api/qr/generate` pour générer
`code_secours`, route isolée `/check-in/{slug}` (layout minimal, même
principe que `/clock/{slug}` — jamais nichée sous
`app/[slug]/[id]/layout.tsx`, qui monte tout le dashboard avant
`{children}`).
**Autorisation appliquée à 4 niveaux** : identification par QR/identifiant,
vérification du PIN, statut du compte, `appointment.check_in` (même clé
RBAC que le fix P0), institution suspendue — jamais la session Check-in ne
donne accès à une route dashboard (cookie/secret/issuer/audience distincts).
**Test** : 3 nouveaux fichiers vitest
(`app/api/checkin/{auth,scan,confirm}/route.test.ts`) couvrant les mêmes
familles de scénarios que GAP-05-01/07-01 (401/423/403/200, cross-institution
avec payload falsifié, réponse minimale sans PII), plus le verrouillage
30 min spécifique à `/api/checkin/auth`.
**Simplifications assumées, honnêteté explicite** : caméra réimplémentée
dans `CheckInApp.tsx` plutôt qu'extraite de `ScannerModal`
(`app/[slug]/[id]/layout.tsx` non touché, ~30 lignes dupliquées) ; 2FA
TOTP dashboard non vérifiée par ce flux ; pas de retry sur collision
`code_secours` (risque négligeable au volume actuel) ; aucun test en
conditions réelles (navigateur mobile, vraie base Supabase).
**Statut** : 🟠 IN PROGRESS — code complet, tests unitaires écrits mais
**non exécutés par Claude Code** (règle du projet), **rien commité**.
**Mise à jour 13/09/2026** : les 2 migrations
(`20260913000001_checkin_sessions.sql`,
`20260913000002_auth_security_checkin_login.sql`) confirmées **exécutées
en base par Bryan** ("Success. No rows returned" sur les deux — cohérent,
aucune des deux ne fait de `SELECT`). `checkin_sessions`, `rdv.code_secours`/
`code_secours_expires_at`, et les catégories `checkin_login`/
`checkin_code_manuel` sur `auth_security_events` existent donc désormais
réellement en base. Reste avant tout test applicatif réel :
`CHECKIN_JWT_SECRET` à définir (local + Netlify, sans quoi
`lib/checkinAuth.ts` échoue au chargement du module), puis `npx vitest
run` (les 4 fichiers de tests qr/checkin) et `npx tsc --noEmit`, puis test
du parcours réel sur un téléphone avant tout commit.
**Preuve** : fichiers listés ci-dessus,
`docs/security/YELEN_ACCUEIL_CHECKIN_DESIGN.md` section "MISE À JOUR —
13/09/2026". **Date** : 13/09/2026.

---

### DEC-2026-09-14-01 — Audit `select("*")` + IDOR/BOLA + URLs signées, demandé par Bryan ("continue, discipline, 2 fichiers max, pas à pas")

**Description** : suite aux recommandations d'un tiers ("expert
cybersécurité") transmises par Bryan sur la convergence des 4 systèmes
d'auth et le durcissement RLS/BOLA/IDOR, Bryan a demandé une exécution
immédiate mais cadrée. Décision prise avec Bryan (AskUserQuestion) de
démarrer par l'item le plus borné : audit `select("*")` + IDOR/BOLA +
URLs signées, en lecture seule d'abord, correctifs un par un seulement
après validation explicite. La convergence des 4 systèmes d'auth n'a
**pas** été commencée — jugée trop large pour un changement non validé
en une fois, reste un chantier séparé à cadrer si Bryan le relance.
**Méthode** : contrairement à la convention historique de ce fichier
("aucune commande terminal sans validation explicite"), Bryan a autorisé
l'usage direct de l'outil Bash dans cette session (git log, npx tsc
--noEmit) — les résultats `tsc` cités dans les items ci-dessous ont donc
été **exécutés et observés directement**, pas seulement demandés à
Bryan. Écart de méthode assumé et documenté ici plutôt que passé sous
silence.
**Résultat global (mis à jour au fil de la session, close le
14-15/09/2026)** : ~60 routes/fichiers vérifiés sur plusieurs lots
(tickets support, conversations, reçus, offres, documents-citoyen,
exports, Clock In Shift, comptes admin, recherche, balayage
`.update()`/`.delete()`, `fetch()` serveur sur donnée utilisateur, open
redirect, path traversal Storage, JWT/randomness, plus les 9
`select("*")` et 20 `createSignedUrl()` du premier passage) ; 8 GAP
nouveaux au total (GAP-06-10, GAP-08-03, GAP-11-02, GAP-05-02, GAP-05-03,
GAP-09-01, GAP-04-06), 6 corrigés en code, 1 code mort supprimé, 1
accepté sans changement. Aucun commit, aucun push. Détail complet dans
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md`.
**Date** : 14-15/09/2026.

---

### DEC-2026-09-14-02 — GAP-06-10 : `select("*")` financier exposé au dashboard institution, corrigé

**Description** : `app/api/institution/services/route.ts` (GET)
utilisait `select("*")` sur `paid_services` et `paid_bookings`
(spread complet `...b` dans la réponse JSON), contrairement au reste du
code financier (`paid-bookings/valider/route.ts`) qui utilise déjà des
listes de colonnes explicites. Pas d'exploit sur les colonnes actuelles,
mais toute colonne future (référence PSP, marge interne, note de
remboursement) aurait atteint silencieusement le dashboard institution.
**Correctif** : colonnes énumérées explicitement pour les deux
`select()` du `GET` — 22 colonnes `paid_services` et 16 colonnes
`paid_bookings`, liste construite à partir de l'historique complet des
migrations (jusqu'à `20260821000012`/`20260805000020`), aucune colonne
actuelle retirée. `POST`/`PATCH` laissés inchangés (profil de risque
différent : écho de la donnée que l'institution vient d'écrire
elle-même, pas une liste accumulée dans le temps).
**Test** : `npx tsc --noEmit` → 0 erreur dans le code source (20 erreurs
préexistantes dans `.next/dev/types/*`, artefacts de build sans rapport).
**Statut** : 🟢 CORRIGÉ (code), **non commité, non testé en conditions
réelles** — Bryan doit vérifier que l'onglet Services/Réservations
affiche toujours tous les champs attendus avant tout commit.
**Preuve** : `app/api/institution/services/route.ts`,
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` section "GAP-06-10".
**Date** : 14/09/2026.

---

### DEC-2026-09-14-03 — GAP-08-03 : code mort `fetchNotifications()`, diagnostic corrigé puis supprimé

**Description** : `lib/notifications.ts::fetchNotifications(destinataireId, limit)`
faisait `select("*")` filtré par un `destinataireId` reçu en paramètre,
sans aucun appelant dans tout le projet (grep exhaustif confirmé).
Qualifié initialement de « BOLA latent » dans le rapport d'audit.
**Correction du diagnostic avant correctif** : le module utilise le
client Supabase **anonyme** (déjà documenté en tête de fichier), et la
table `notifications` a pour seule policy RLS `notif_destinataire_own`
(`FOR ALL USING (auth.uid() = destinataire_id AND destinataire_type =
'citoyen')`, migration `20260709000006_alter_notifications.sql`). RLS
bloque donc déjà toute lecture croisée quel que soit le `destinataireId`
passé en argument — ce n'était pas un BOLA exploitable, seulement du
code mort avec un nom de paramètre trompeur.
**Correctif** : fonction supprimée entièrement (convention du projet :
code confirmé inutilisé → suppression complète).
**Test** : `npx tsc --noEmit` → 0 erreur.
**Statut** : 🟢 CORRIGÉ, **non commité**.
**Preuve** : `lib/notifications.ts`,
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` section "GAP-08-03".
**Date** : 14/09/2026.

---

### DEC-2026-09-14-04 — GAP-11-02 : TTL messagerie-images — TEMPORARY ACCEPTED GAP

**Description** : `messagerie-images` (5 routes institution/citoyen)
signe ses URLs pour 3600s contre 60s partout ailleurs (documents, reçus,
signalements) — repéré comme incohérence de politique dans l'audit
initial.
**Investigation avant correctif** : `MessagerieTab.tsx:187-197`
(`resolveImageUrls`) signe chaque chemin d'image une seule fois, à
l'arrivée des messages, puis conserve le résultat en state pour toute la
durée où la conversation reste ouverte à l'écran — aucun mécanisme de
re-signature n'existe. Réduire à 60s casserait visiblement l'affichage
des images dans toute conversation ouverte plus d'une minute.
**Décision de Bryan** : accepter 3600s comme un compromis produit
délibéré. Aucune modification de code.
**Amélioration future possible, non engagée** : re-signature périodique
côté `resolveImageUrls` (ex. avant échéance à 45min) pour pouvoir
redescendre le TTL sans casser l'UX — chantier séparé si priorisé.
**Statut** : ⚫ EXCEPTION APPROVED — **TEMPORARY ACCEPTED GAP** (même
format que GAP-10-01/GAP-04-02).
**Preuve** : `docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` section
"GAP-11-02". **Date** : 14/09/2026.

---

### DEC-2026-09-14-05 — GAP-05-02 : permission `search.read` restreinte, alignée sur `citoyens.read`

**Description** : `search.read` (gate de `app/api/admin/search/route.ts`,
recherche globale institutions+citoyens) était accordée à
`["super_admin", "moderateur", "support", "admin"]`, alors que
`citoyens.read` (fiche citoyen complète) est délibérément restreinte à
`["super_admin", "admin"]` — chaque autre permission liée aux citoyens
dans `lib/adminAuth.ts` a une séparation de rôle justifiée par un
commentaire explicite ; `search.read` n'en avait aucune. Un admin
`moderateur`/`support` pouvait retrouver nom/prénom/téléphone de
n'importe quel citoyen via la recherche globale, sans lien avec un
ticket ou une modération en cours.
**Décision de Bryan** : restreindre à `["super_admin", "admin"]`, même
périmètre que `citoyens.read`. Si `support` a besoin de retrouver un
citoyen pour un ticket, ce sera une recherche séparée scopée à
`support.access`, pas la réouverture de celle-ci.
**Correctif** : `lib/adminAuth.ts` — `search.read` restreinte, commentaire
ajouté expliquant la décision.
**Test** : `npx tsc --noEmit` → 0 erreur. Vérifié que le seul appelant
(`app/admin/page.tsx:88-95`) échoue déjà silencieusement sur `!res.ok`
(pas de `throw`/crash) — un compte `moderateur`/`support` verra une
recherche vide, zéro régression visible.
**Statut** : 🟢 CORRIGÉ (code), **non commité, non testé en conditions
réelles** (session support/modérateur réelle).
**Preuve** : `lib/adminAuth.ts`, `app/admin/page.tsx:88-95` (lecture),
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` section "GAP-05-02".
**Date** : 14/09/2026.

---

### DEC-2026-09-14-06 — GAP-05-03 : mass assignment sur `annonces/[id]/route.ts`, corrigé

**Description** : `app/api/admin/annonces/[id]/route.ts` (PATCH)
faisait `.update(body)` brut sur `annonces`, sans liste blanche de
colonnes — même classe de bug que le mass-assignment déjà corrigé le
19/07/2026 sur `admin_users` (voir commentaire dans
`admins/[id]/route.ts`), manquée ici. `annonces.moderate` est accordée
au rôle `support`.
**Risque** : réassignation d'une annonce à une autre institution
(`institution_id`), métriques falsifiées (`nb_vues`/`nb_clics`/
`nb_partages`), ou réécriture de la clé primaire (`id` différent dans le
corps).
**Correctif** : même pattern que `admins/[id]/route.ts` — liste blanche
`['titre', 'contenu', 'type', 'statut', 'date_expiration', 'epingle']`,
construite à partir de l'usage réel confirmé dans
`app/admin/annonces/page.tsx:44-68` (formulaire complet envoie
exactement ces 6 champs, toggle épinglage envoie `epingle` seul — zéro
risque de régression). `admin_logs.details` loggue désormais `updates`
(filtré) au lieu de `body` (brut).
**Test** : `npx tsc --noEmit` → 0 erreur.
**Statut** : 🟢 CORRIGÉ (code), **non commité, non testé en conditions
réelles** — Bryan doit vérifier que l'édition/l'épinglage d'annonce
fonctionnent toujours avant tout commit.
**Preuve** : `app/api/admin/annonces/[id]/route.ts`,
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` section "GAP-05-03".
**Date** : 14/09/2026.

---

### DEC-2026-09-14-07 — GAP-09-01 : SSRF via `lib/recuPdf.ts::chargerImageDistante()`, corrigé

**Description** : trouvé en élargissant l'audit à d'autres classes de
vulnérabilités (`fetch()` serveur sur une donnée contrôlée par
l'utilisateur). La génération du PDF de reçu fait un `fetch(url)` brut
sur `institutions.logo` et `users.photo_url`, ni l'un ni l'autre jamais
validé comme URL à l'écriture (`app/api/institution/profile/route.ts`
pour `logo` — contrairement à `website`, seul champ protégé depuis le
chantier P0 Stored XSS du 17/08/2026 ; `app/profil/actions.ts:37` pour
`photo_url`). Même `validerUrlExterne()` (déjà en place pour `website`)
n'aurait pas suffi : elle valide le schéma `http(s):`, jamais la cible
réseau.
**Risque** : une institution ou un citoyen authentifié règle son
`logo`/`photoUrl` sur une cible interne (métadonnées cloud, service
interne, `localhost`), puis déclenche la génération d'un reçu — SSRF
serveur. Aggravé par l'absence de limite de taille/timeout sur le
buffer téléchargé.
**Correctif** : `chargerImageDistante()` n'accepte plus que les URLs
commençant par `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/`
— seule origine produite par l'upload applicatif réel (`getPublicUrl()`),
zéro impact sur l'usage légitime.
**Test** : `npx tsc --noEmit` → 0 erreur.
**Statut** : 🟢 CORRIGÉ (code), **non commité, non testé en conditions
réelles** — Bryan doit vérifier qu'un reçu avec logo/photo réels
continue d'afficher ces images après ce correctif.
**Preuve** : `lib/recuPdf.ts`,
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` section "GAP-09-01".
**Date** : 14/09/2026.

---

### DEC-2026-09-14-08 — GAP-04-06 : randomness non cryptographique sur l'OTP citoyen, corrigée

**Description** : `lib/auth/otp.ts::genererCode6Chiffres()` utilisait
`Math.random()` pour générer le code OTP citoyen, alors que le flux
institution équivalent (`app/api/institution/auth/send-otp/route.ts:132`)
utilise déjà `crypto.randomInt()` depuis le durcissement du 13/08/2026 —
le flux citoyen (population principale) avait été manqué à cette
occasion.
**Risque** : `Math.random()` n'est pas un CSPRNG (CWE-338). Chemin de
code aujourd'hui dormant (actif seulement une fois `SMS_PROVIDER`
configuré — pas encore le cas, la connexion citoyen réelle utilise
`CITOYEN_OTP_FALLBACK`), mais corrigé maintenant plutôt qu'au moment où
Nimba SMS sera branché.
**Correctif** : `crypto.randomInt(100000, 1000000)`, mêmes bornes que
le générateur institution.
**Test** : `npx tsc --noEmit` → 0 erreur.
**Balayage complémentaire** : `jose` (pas `jsonwebtoken`) pour tous les
JWT du projet, résistant par conception à la confusion d'algorithme ;
jetons de défi 2FA confirmés avec expiration explicite ; aucune autre
occurrence de `Math.random()` sur un chemin sécuritaire.
**Statut** : 🟢 CORRIGÉ, **non commité**.
**Preuve** : `lib/auth/otp.ts`,
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` section "GAP-04-06".
**Date** : 14/09/2026.

---

### DEC-2026-09-15-01 — GAP-08-04 : condition de course sur la capacité des créneaux RDV — corrigée en code, migration en attente

**Description** : demande de Bryan de mener une revue critique élargie
("suis le projet, pas mon avis"). En relisant `app/rdv/[id]/actions.ts`
(déjà touché par le correctif GAP-08-02 du 01/09/2026), trouvaille d'une
vraie condition de course TOCTOU : `validerCreneauServeur()` comptait les
`rdv`/`paid_bookings` existants pour un créneau et comparait à
`institutions.capacite_par_creneau` (simple colonne, aucune contrainte
DB), mais `createRdv()` insérait séparément — deux réservations
concurrentes sur le même dernier créneau pouvaient toutes deux passer le
comptage avant qu'aucune n'ait inséré.
**Risque** : surréservation silencieuse, plausible organiquement sous
charge normale (capacité par défaut = 1), sans intention malveillante
nécessaire.
**Correctif** : nouvelle fonction Postgres `reserver_creneau_rdv()`
(`supabase/migrations/20260915000001_reserver_creneau_rdv_atomique.sql`)
— comptage + insertion atomiques sous `pg_advisory_xact_lock` scopé au
créneau. Volontairement sans `SECURITY DEFINER` : s'exécute avec les
droits de l'appelant, donc les policies RLS existantes (ownership,
restriction no-show) continuent de s'appliquer sans contournement.
`date_rdv`/`heure_rdv` acceptés en `text` pour ne jamais deviner le type
réel de colonne (`rdv` est une table d'origine sans `CREATE TABLE` dans
les migrations). `actions.ts` basculé sur `supabase.rpc(...)` au lieu
d'un insert direct.
**Test** : `npx tsc --noEmit` → 0 erreur.
**Statut** : 🟡 NEEDS REVIEW — **migration exécutée avec succès par
Bryan le 15/09/2026** ("Success. No rows returned"). Aucun test de
concurrence réel possible dans cet environnement ; test fonctionnel du
parcours de réservation normal (créneau libre/complet) reste à faire
par Bryan avant tout commit, en priorité vu que ce correctif touche le
flux de réservation principal du produit.
**Preuve** :
`supabase/migrations/20260915000001_reserver_creneau_rdv_atomique.sql`
(exécutée), `app/rdv/[id]/actions.ts`,
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` section "GAP-08-04".
**Date** : 15/09/2026.

---

### DEC-2026-09-15-02 — GAP-09-02 : flux de réservation payant sans aucune validation serveur — plus sévère que GAP-08-04, corrigé en code

**Description** : en continuant la revue critique de GAP-08-04,
vérification si le flux PAYANT avait le même défaut — trouvé pire :
`app/rdv/[id]/page.tsx` insérait directement depuis le navigateur dans
`paid_bookings` PUIS `rdv`, sans jamais passer par
`validerCreneauServeur()`/un Server Action. Seules les policies RLS
(`auth.uid()=citoyen_id`, migration `20260720000004`) protégeaient
l'appel — aucune vérification d'institution validée, de créneau
réellement disponible, ou de capacité, pas même une version racy comme
GAP-08-04. Les deux inserts n'étaient de plus pas atomiques entre eux.
Le `confirmation_code`/`qr_token` était généré et entièrement contrôlé
côté navigateur.
**Risque** : abus/spam du système de réservation payant (surréservation
massive, pas juste 1-2 places), réservations pour institutions
suspendues, `paid_booking` orphelins en cas d'échec partiel.
**Correctif** : `reserver_creneau_rdv_payant()` (même migration que
GAP-08-04) — même verrou de créneau, vérifie en plus l'appartenance et
l'activité du service, insère `paid_bookings`+`rdv` en tout-ou-rien.
Nouveau Server Action `creerReservationPayante()`, même structure que
`createRdv()`. `page.tsx` rewiré pour l'appeler. Bonus cohérent :
`createRdv()` (déjà modifiée pour GAP-08-04) génère désormais aussi son
`qr_token` côté serveur (`crypto.randomInt`) au lieu de l'accepter du
client. `genCode()` et `notifierReservationPayante()` (devenues code
mort) supprimées.
**Test** : `npx tsc --noEmit` → 0 erreur.
**Statut** : 🟡 NEEDS REVIEW — **migration exécutée avec succès (même
migration que GAP-08-04)**. Flux de réservation payante (l'un des plus
utilisés du produit) non testé en conditions réelles — priorité absolue
pour Bryan avant tout commit, avant même de retester le flux gratuit.
**Preuve** : `supabase/migrations/20260915000001_reserver_creneau_rdv_atomique.sql`
(exécutée), `app/rdv/[id]/actions.ts`, `app/rdv/[id]/page.tsx`,
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` section "GAP-09-02".
**Date** : 15/09/2026.

---

### DEC-2026-09-15-03 — GAP-09-03 : `avis` insert client-direct — piste ouverte, bloquée sur SQL, connectée à une dette déjà signalée le 16/08/2026

**Description** : en cherchant d'autres tables au même pattern que
GAP-09-02, repéré `app/mes-rdv/page.tsx:612` (`avis` inséré directement
depuis le navigateur, `rdv_id` non revérifié côté serveur). Recherche
dans les docs existants : `docs/product/YELEN_TRUST_DATA_AUDIT.md`
(16/08/2026, section 2.6) avait déjà documenté ce point exact —
`avis_citoyen_own` "référencée en commentaire mais son `CREATE POLICY`
littéral **[NV]**, non retrouvé (pré-existante)" — jamais refermé
depuis. Contrairement à `rdv`/`paid_bookings` (GAP-08-04/GAP-09-02) où
la policy exacte était confirmée par migration, le contenu réel de la
policy INSERT sur `avis` reste inconnu.
**Décision** : aucun correctif écrit — construire une validation sans
connaître la policy réelle irait à l'encontre du protocole ("zéro
donnée inventée"), risquerait de dupliquer une protection déjà en place
ou de mal cibler le vrai trou.
**Confirmé par Bryan (15/09/2026)** — requête SQL exécutée :
```
policyname,cmd,qual,with_check
avis_citoyen_own,ALL,(auth.uid() = citoyen_id),null
```
Une seule policy, `FOR ALL`, `with_check` NULL — Postgres réutilise
`USING` pour l'INSERT en l'absence de `WITH CHECK` séparé (même piège
déjà rencontré sur `notifications`, documenté dans CLAUDE.md
/pieges-techniques-connus). Confirmé : aucune vérification de `rdv_id`/
statut terminé/cohérence `institution_id` à l'insertion.
**Correctif** : `soumettreAvis()` ajoutée dans `app/mes-rdv/actions.ts`
(même fichier/style que `annulerRdv`/`reporterRdv`, réutilise
`chargerRdvEtVerifier()`) — vérifie appartenance + `statut==='termine'`,
dérive `institution_id` du rdv réel, empêche les doublons (aucune
contrainte `UNIQUE` connue sur `rdv_id`+`citoyen_id`, contrairement à
`avis_utile`). `page.tsx::handleEnvoyerAvis` basculé dessus ;
`notifierPublicationAvis()` (code mort) supprimée. La route API
`/api/citoyen/avis/notifier-publication` reste utilisée par le flux
séparé "Mes avis" (édition d'un brouillon existant, non touché).
**Test** : `npx tsc --noEmit` → 0 erreur.
**Différence avec GAP-08-04/GAP-09-02** : aucune migration requise —
pur code applicatif, déployable indépendamment.
**Statut** : 🟢 CORRIGÉ (code), **non commité, non testé en conditions
réelles** — parcours "laisser un avis" à tester par Bryan avant tout
commit.
**Preuve** : `docs/product/YELEN_TRUST_DATA_AUDIT.md` section 2.6,
`app/mes-rdv/actions.ts`, `app/mes-rdv/page.tsx`,
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` section "GAP-09-03".
**Date** : 15/09/2026.

---

### DEC-2026-09-15-04 — GAP-08-04/GAP-09-02 : bug réel de cast trouvé en testant, corrigé, les deux flux de réservation confirmés fonctionnels

**Description** : premier test en conditions réelles par Bryan (flux
RDV gratuit) → échec avec le message générique. Log serveur demandé et
obtenu : `column "date_rdv" is of type date but expression is of type
text`. Le commentaire de la migration `20260915000001` affirmait à tort
que Postgres appliquerait un cast d'assignation automatique text→date
dans un `INSERT` — faux pour une variable plpgsql explicitement typée
`text` (l'auto-cast habituel via PostgREST sur un insert direct depuis
le client ne s'applique pas à l'intérieur d'une fonction SQL). L'erreur
elle-même a confirmé, en conditions réelles, ce qu'aucune migration ne
donnait comme ground truth (`rdv` est une table d'origine) :
`date_rdv` est bien `date`, et par symétrie `heure_rdv` est `time`.
**Correctif** : `supabase/migrations/20260915000002_fix_cast_reserver_creneau.sql`
— `CREATE OR REPLACE` des deux fonctions, cast explicite
`p_date_rdv::date`/`p_heure_rdv::time` uniquement dans les `INSERT` (les
comparaisons `WHERE`, qui castent la colonne EN text, n'avaient pas ce
problème). Aucun besoin de refaire les `GRANT`/`REVOKE` — signature de
fonction inchangée.
**Étape intermédiaire** : avant de trouver la vraie cause, hypothèse du
cache de schéma PostgREST non rechargé après la première migration
(`NOTIFY pgrst, 'reload schema'` proposée et exécutée) — n'était pas la
cause réelle, mais réflexe correct à avoir en premier après toute
`CREATE FUNCTION` fraîche.
**Test** : migration exécutée par Bryan, **les deux flux (gratuit et
payant) testés en conditions réelles et confirmés fonctionnels**.
**Statut** : 🟢 VERIFIED — GAP-08-04 et GAP-09-02 tous deux clos.
**Preuve** : `supabase/migrations/20260915000002_fix_cast_reserver_creneau.sql`,
confirmation de Bryan en conditions réelles,
`docs/security/YELEN_SECURITY_GAP_ANALYSIS.md` sections "GAP-08-04"/
"GAP-09-02". **Date** : 15/09/2026.
