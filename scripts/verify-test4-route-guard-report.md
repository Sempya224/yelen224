# Test 4 (route guard) — généré le 2026-08-16T19:18:04.835Z
Cible : http://localhost:3000/api/institution/documents

**Rappel : nécessite le serveur dev démarré séparément (`npm run dev`).**

Institution de test créée : 958fb69b-eb8d-483f-8089-5a02eb6d0ee2
Membre de test créé : 36d3e8ab-9de0-4fad-9f7b-9cddc3134dcf
Document 'rccm' créé avec statut='valide'.

Cookie de session JWT fabriqué (5 min de validité).
Statut HTTP reçu : 409
Corps de réponse : {"error":"Ce document est déjà en cours d'examen ou validé — aucun renvoi possible pour l'instant."}

✅ PASS — la route a bien bloqué le renvoi avec 409, avant tout appel au RPC.

## Nettoyage
documents_institution non supprimé automatiquement (attendu, table immuable) : documents_institution: suppression interdite, aucune version n'est jamais supprimée (id=fa99c5a9-cd5b-4277-bf7f-76e835ca66ab). Nettoyage manuel requis (voir ci-dessous).
institutions non supprimé : documents_institution: suppression interdite, aucune version n'est jamais supprimée (id=fa99c5a9-cd5b-4277-bf7f-76e835ca66ab)

Si des lignes subsistent (cas normal pour documents_institution,
immuable), nettoyage manuel dans le SQL Editor :
```sql
BEGIN;
SET LOCAL app.autoriser_correction_documents_institution = 'on';
DELETE FROM documents_institution WHERE institution_id = '958fb69b-eb8d-483f-8089-5a02eb6d0ee2';
DELETE FROM institution_membres WHERE institution_id = '958fb69b-eb8d-483f-8089-5a02eb6d0ee2';
DELETE FROM institutions WHERE id = '958fb69b-eb8d-483f-8089-5a02eb6d0ee2';
COMMIT;
```
