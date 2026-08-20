# Inventaire bucket "documents" — généré le 2026-08-16T17:09:46.720Z

**Lecture seule — aucune écriture effectuée par ce script.**

## 1. Existence et visibilité
Bucket trouvé : id=documents, public=false, created_at=2026-08-14T06:32:48.684Z, file_size_limit=aucun, allowed_mime_types="aucun"

## 2. Objets réels présents dans le bucket
3 objet(s) trouvé(s) :
- `585088aa-821c-4a27-a2b6-c4149f214f96/piece_identite.pdf` (taille=1572 octets, modifié=2026-08-14T06:33:13.144Z)
- `585088aa-821c-4a27-a2b6-c4149f214f96/preuve_domicile.pdf` (taille=3373944 octets, modifié=2026-08-14T08:25:32.776Z)
- `585088aa-821c-4a27-a2b6-c4149f214f96/Untitled folder/.emptyFolderPlaceholder` (taille=0 octets, modifié=2026-08-14T06:49:58.280Z)

## 3. Lignes `documents_institution` (correspondance DB <-> Storage)
2 ligne(s) trouvée(s) :
- id=77213ef7-438f-45d2-8170-09013723f91a institution_id=585088aa-821c-4a27-a2b6-c4149f214f96 type=piece_identite statut=recu url=`585088aa-821c-4a27-a2b6-c4149f214f96/piece_identite.pdf` soumis_le=2026-08-14T06:33:10.198+00:00 → fichier Storage correspondant trouvé : OUI
- id=c9f1c9d2-6f4c-4c9c-a052-3802b35c6cce institution_id=585088aa-821c-4a27-a2b6-c4149f214f96 type=preuve_domicile statut=recu url=`585088aa-821c-4a27-a2b6-c4149f214f96/preuve_domicile.pdf` soumis_le=2026-08-14T08:25:30.067+00:00 → fichier Storage correspondant trouvé : OUI

**Lignes DB sans fichier Storage correspondant : 0.**
**Fichiers Storage sans ligne DB correspondante : 1.**
Toute incohérence trouvée ici doit être documentée dans le rapport de migration, jamais supprimée silencieusement (consigne CEO Lot 2.4, item 5).

## 4. Doublons (institution_id, type)
Aucun doublon — attendu, la contrainte UNIQUE(institution_id,type) actuelle l'interdit déjà.

## 5. Requête complémentaire à exécuter manuellement (SQL Editor)
Ce script ne peut pas lister les policies RLS sur `storage.objects` (hors de l'API Storage JS) :
```sql
SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname='storage' AND tablename='objects';
```
Coller le résultat dans le rapport de migration.
