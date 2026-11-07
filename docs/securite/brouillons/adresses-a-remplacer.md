# Inventaire des adresses (aucune modifiee) - releve du 07/11/2026, branche feat/exports-nommage

## Adresses de remplissage (placeholders)
| Fichier : ligne | Adresse | Nature |
|---|---|---|
| `app/admin/login/page.tsx:284` | `admin@yelen224.gn` | placeholder du champ e-mail |
| `app/admin/admins/page.tsx:142` | `admin@yelen224.com` | placeholder du champ e-mail |

## `contact@yelen224.com`
- `lib/recuPdf.ts:367`
- `lib/notificationEngine.ts:36` (valeur par defaut du sujet VAPID `mailto:`)
- `app/(legal)/politique-cookies/page.tsx` : 153, 268, 478
- `app/(legal)/mentions-legales/mentions-legales-client.tsx` : 43, 83, 136, 143, 144, 145
- `app/(legal)/confidentialite/page.tsx` : 189, 207, 402, 438, 470
- `app/(legal)/conditions-prestataires/page.tsx` : 222, 267, 415, 431, 435, 439
- `app/(legal)/cgu/page.tsx` : 381, 413, 464, 490

## `support@yelen224.com`
- `components/security/AuthSecurityBlockedScreen.tsx:42` (valeur par defaut de `supportEmail`)
- `app/[slug]/[id]/layout.tsx` : 1271, 5516, 6148, 6156
- `app/[slug]/[id]/components/ParametresTab.tsx:170`
- `app/[slug]/[id]/components/MonPartenariatTab.tsx:241`
- `app/[slug]/[id]/components/DocumentsTab.tsx:149`
- `app/[slug]/[id]/components/CompteSuspenduScreen.tsx:369`
- `app/check-in/[slug]/CheckInApp.tsx` : 432, 435
- `app/messagerie/citoyen/page.tsx:1680`

## Hors code applicatif (documentation uniquement, pour memoire)
`docs/support-center/public-support-technical-design.md:533`, `docs/support-center/public-support-architecture.md:612`, `docs/product/*` (plusieurs lignes).
Les variables `POSTMARK_FROM_EMAIL` et `VAPID_SUBJECT` ne sont pas lisibles depuis le depot (variables d'environnement).

Note : la grep porte sur `ts, tsx, js, json, html, md`. Elle ne couvre pas d'eventuels fichiers de traduction hors de ces extensions ni la base de donnees.
