# Rapport tests de concurrence — généré le 2026-08-16T17:43:03.747Z
Institution de test : 585088aa-821c-4a27-a2b6-c4149f214f96

## Test 5 — deux dépôts concurrents sur la même paire (institution, type)
Durée totale (les deux appels en parallèle) : 1296 ms.
Appel A : fulfilled (error=aucune)
Appel B : fulfilled (error=aucune)
Lignes actives après le test : 1 (ATTENDU : exactement 1 — le verrou consultatif doit avoir sérialisé les deux appels, jamais deux lignes actives simultanées).
✅ PASS

## Test 6 — deux dépôts concurrents, paires différentes (même institution)
Durée totale : 207 ms (indicatif — devrait être proche du temps d'un seul appel, pas la somme des deux, si le verrou ne sérialise pas des paires indépendantes).
Appel A (rccm) : fulfilled
Appel B (nomination_habilitation) : fulfilled
Lignes actives rccm=1, nomination_habilitation=1 (ATTENDU : 1 chacune, aucun chemin Storage en collision par construction — chemins uuid).
✅ PASS

## Test 12 — rollback transactionnel (échec forcé)
Ce test nécessite une fonction jumelle temporaire créée manuellement
avant de lancer ce script (voir instructions ci-dessous), puis
supprimée après. Le script suppose qu'elle existe sous le nom
`deposer_nouvelle_version_document_test_echec` avec la même signature.

SQL à exécuter AVANT ce script (SQL Editor, une fois) :
```sql
CREATE OR REPLACE FUNCTION deposer_nouvelle_version_document_test_echec(
  p_institution_id uuid, p_type text, p_nom text, p_storage_path text,
  p_hash_integrite text, p_soumis_par_membre_id uuid
) RETURNS documents_institution LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ancienne documents_institution;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_institution_id::text || ':' || p_type));
  SELECT * INTO v_ancienne FROM documents_institution WHERE institution_id=p_institution_id AND type=p_type AND statut_actif FOR UPDATE;
  IF v_ancienne.id IS NOT NULL THEN
    UPDATE documents_institution SET statut_actif=false WHERE id=v_ancienne.id;
  END IF;
  RAISE EXCEPTION 'ECHEC FORCE — test rollback Lot 2.4, ne devrait jamais persister';
END; $$;
GRANT EXECUTE ON FUNCTION deposer_nouvelle_version_document_test_echec(uuid,text,text,text,text,uuid) TO service_role;
```
Ligne active avant l'échec forcé : id=c9fe8e11-610d-47d7-9272-9a5054b2533d, numero_version=2.
Résultat de l'appel forcé à échouer : error=ECHEC FORCE — test rollback Lot 2.4, ne devrait jamais persister
Ligne active après l'échec forcé : id=c9fe8e11-610d-47d7-9272-9a5054b2533d, numero_version=2 (ATTENDU : IDENTIQUE à "avant" — la désactivation a dû être annulée avec le reste de la transaction).
✅ PASS — rollback confirmé, aucune moitié d'opération n'a persisté.

SQL à exécuter APRÈS ce test (nettoyage, une fois) :
```sql
DROP FUNCTION IF EXISTS deposer_nouvelle_version_document_test_echec(uuid,text,text,text,text,uuid);
```
