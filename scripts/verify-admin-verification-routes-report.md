# Tests routes admin verification — généré le 2026-08-16T20:43:22.554Z
Cible : http://localhost:3000/api/admin/institutions/[id]/verification

Institution=f98d295d-e228-4110-a9cc-fa02e44c030a, membre=0cbf94f4-6d9b-43a3-979f-b72eb1449f6b, document=1adaca79-4c13-4e02-ae5e-c88fbcb3effd, admin réel=sempya224@proton.me (super_admin)

✅ PASS — GET sans cookie → 401 (obtenu 401)
✅ PASS — GET admin sans institutions.verify → 403 (obtenu 403)
✅ PASS — GET admin sans MFA → 403 MFA_SETUP_REQUIRED (obtenu 403 MFA_SETUP_REQUIRED)
✅ PASS — GET avec cookie institution (jamais admin) → 401 (obtenu 401)
✅ PASS — GET institution inexistante → 404 (obtenu 404)
✅ PASS — GET admin autorisé → 200, dossier complet avec URL signée (obtenu 200)
  → 1 document(s), decisions.identite.actuelle=null
✅ PASS — URL signée → contenu réel accessible (obtenu 200)
✅ PASS — Accès direct sans signature (bucket privé) → refusé (obtenu 400, jamais 200)

✅ PASS — POST sans cookie → 401 (obtenu 401)
✅ PASS — POST admin sans institutions.verify → 403 (obtenu 403)
✅ PASS — POST décision valide → 200, decision_id=YL-VER-2026-00000010 (obtenu 200)
✅ PASS — POST avec état périmé → 409 CONFLIT_CONCURRENCE (obtenu 409 CONFLIT_CONCURRENCE)
✅ PASS — POST avec preuve remplacée → 409 PREUVE_PERIMEE (obtenu 409 PREUVE_PERIMEE)

## Résultat : 13 PASS, 0 FAIL

## Nettoyage
SQL à exécuter (SQL Editor) :
```sql
BEGIN;
SET LOCAL app.autoriser_correction_verification_decisions = 'on';
SET LOCAL app.autoriser_correction_verification_decision_preuves = 'on';
SET LOCAL app.autoriser_correction_documents_institution = 'on';
SET LOCAL app.autoriser_correction_journal = 'on';
SET LOCAL app.autoriser_correction_signalement = 'on';
DELETE FROM verification_decision_preuves WHERE decision_id IN (SELECT id FROM verification_decisions WHERE institution_id = 'f98d295d-e228-4110-a9cc-fa02e44c030a');
DELETE FROM verification_decisions WHERE institution_id = 'f98d295d-e228-4110-a9cc-fa02e44c030a';
DELETE FROM documents_institution WHERE institution_id = 'f98d295d-e228-4110-a9cc-fa02e44c030a';
DELETE FROM institution_membres WHERE institution_id = 'f98d295d-e228-4110-a9cc-fa02e44c030a';
DELETE FROM institutions WHERE id = 'f98d295d-e228-4110-a9cc-fa02e44c030a';
COMMIT;
```
