#!/usr/bin/env node
/**
 * TRUST — Lot 2.4, tests de CONCURRENCE et de ROLLBACK (scénarios 5, 6, 12
 * du plan, + les tests de concurrence explicitement ajoutés par le CEO :
 * deux dépôts simultanés sur la même paire institution+type, deux dépôts
 * simultanés sur des paires différentes, échec forcé au milieu de la
 * transaction).
 *
 * ⚠️ CE SCRIPT ÉCRIT DE VRAIES LIGNES DANS documents_institution ET DE
 * VRAIS FICHIERS DANS LE BUCKET STORAGE. NE JAMAIS L'EXÉCUTER CONTRE DES
 * DONNÉES DE PRODUCTION — uniquement contre une institution de test
 * dédiée, jetable. À exécuter manuellement par Bryan (jamais par Claude
 * Code, cf. CLAUDE.md).
 *
 * Usage :
 *   TEST_INSTITUTION_ID=... TEST_MEMBRE_ID=... TEST_AUTRE_MEMBRE_ID=... \
 *     node scripts/verify-documents-concurrency.mjs
 *
 * TEST_AUTRE_MEMBRE_ID doit appartenir à une institution DIFFÉRENTE de
 * TEST_INSTITUTION_ID (réutilisé pour le test 9 de falsification, déjà
 * couvert par le script SQL séquentiel — ce script se concentre sur la
 * concurrence).
 *
 * Produit scripts/verify-documents-concurrency-report.md.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const rawLine of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.replace(/\r$/, ""); // fins de ligne Windows (CRLF)
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TEST_INSTITUTION_ID = process.env.TEST_INSTITUTION_ID;
const TEST_MEMBRE_ID = process.env.TEST_MEMBRE_ID;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY dans .env.local — arrêt.");
  process.exit(1);
}
if (!TEST_INSTITUTION_ID || !TEST_MEMBRE_ID) {
  console.error("Manque TEST_INSTITUTION_ID et/ou TEST_MEMBRE_ID (variables d'environnement) — arrêt. NE JAMAIS pointer vers une institution de production.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const lignes = [];
const log = (s = "") => { lignes.push(s); console.log(s); };

function deposer(type, nom, hash) {
  return sb.rpc("deposer_nouvelle_version_document", {
    p_institution_id: TEST_INSTITUTION_ID,
    p_type: type,
    p_nom: nom,
    p_storage_path: `${TEST_INSTITUTION_ID}/${type}/test-${randomUUID()}.pdf`,
    p_hash_integrite: hash,
    p_soumis_par_membre_id: TEST_MEMBRE_ID,
  });
}

async function lignesActives(type) {
  const { data, error } = await sb
    .from("documents_institution")
    .select("id, numero_version, statut_actif")
    .eq("institution_id", TEST_INSTITUTION_ID)
    .eq("type", type)
    .eq("statut_actif", true);
  if (error) throw error;
  return data;
}

async function main() {
  log(`# Rapport tests de concurrence — généré le ${new Date().toISOString()}`);
  log(`Institution de test : ${TEST_INSTITUTION_ID}`);
  log("");

  // ============================================================
  // TEST 5 — Deux dépôts concurrents, MÊME paire (institution_id, type).
  // ============================================================
  log("## Test 5 — deux dépôts concurrents sur la même paire (institution, type)");
  const typeTest5 = "preuve_domicile";
  const t0 = Date.now();
  const [r1, r2] = await Promise.allSettled([
    deposer(typeTest5, "concurrent-A.pdf", "hash-A"),
    deposer(typeTest5, "concurrent-B.pdf", "hash-B"),
  ]);
  const dureeMs = Date.now() - t0;
  log(`Durée totale (les deux appels en parallèle) : ${dureeMs} ms.`);
  log(`Appel A : ${r1.status}${r1.status === "fulfilled" ? ` (error=${r1.value.error?.message ?? "aucune"})` : ` (${r1.reason})`}`);
  log(`Appel B : ${r2.status}${r2.status === "fulfilled" ? ` (error=${r2.value.error?.message ?? "aucune"})` : ` (${r2.reason})`}`);

  const actives5 = await lignesActives(typeTest5);
  log(`Lignes actives après le test : ${actives5.length} (ATTENDU : exactement 1 — le verrou consultatif doit avoir sérialisé les deux appels, jamais deux lignes actives simultanées).`);
  log(actives5.length === 1 ? "✅ PASS" : "❌ FAIL — incohérence trouvée, à investiguer avant toute suite du Lot 2.4.");
  log("");

  // ============================================================
  // TEST 6 + concurrence "types différents" — deux dépôts concurrents sur
  // des paires DIFFÉRENTES (même institution) : ne doivent pas se bloquer
  // mutuellement (verrou scindé par hashtext(institution_id||':'||type)).
  // ============================================================
  log("## Test 6 — deux dépôts concurrents, paires différentes (même institution)");
  const t1 = Date.now();
  const [r3, r4] = await Promise.allSettled([
    deposer("rccm", "diff-A.pdf", "hash-diff-A"),
    deposer("nomination_habilitation", "diff-B.pdf", "hash-diff-B"),
  ]);
  const duree2 = Date.now() - t1;
  log(`Durée totale : ${duree2} ms (indicatif — devrait être proche du temps d'un seul appel, pas la somme des deux, si le verrou ne sérialise pas des paires indépendantes).`);
  log(`Appel A (rccm) : ${r3.status}`);
  log(`Appel B (nomination_habilitation) : ${r4.status}`);
  const actRccm = await lignesActives("rccm");
  const actNom = await lignesActives("nomination_habilitation");
  log(`Lignes actives rccm=${actRccm.length}, nomination_habilitation=${actNom.length} (ATTENDU : 1 chacune, aucun chemin Storage en collision par construction — chemins uuid).`);
  log((actRccm.length === 1 && actNom.length === 1) ? "✅ PASS" : "❌ FAIL");
  log("");

  // ============================================================
  // TEST 12 — Rollback transactionnel (échec forcé au milieu de l'opération).
  // ============================================================
  log("## Test 12 — rollback transactionnel (échec forcé)");
  log("Ce test nécessite une fonction jumelle temporaire créée manuellement");
  log("avant de lancer ce script (voir instructions ci-dessous), puis");
  log("supprimée après. Le script suppose qu'elle existe sous le nom");
  log("`deposer_nouvelle_version_document_test_echec` avec la même signature.");
  log("");
  log("SQL à exécuter AVANT ce script (SQL Editor, une fois) :");
  log("```sql");
  log("CREATE OR REPLACE FUNCTION deposer_nouvelle_version_document_test_echec(");
  log("  p_institution_id uuid, p_type text, p_nom text, p_storage_path text,");
  log("  p_hash_integrite text, p_soumis_par_membre_id uuid");
  log(") RETURNS documents_institution LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$");
  log("DECLARE v_ancienne documents_institution;");
  log("BEGIN");
  log("  PERFORM pg_advisory_xact_lock(hashtext(p_institution_id::text || ':' || p_type));");
  log("  SELECT * INTO v_ancienne FROM documents_institution WHERE institution_id=p_institution_id AND type=p_type AND statut_actif FOR UPDATE;");
  log("  IF v_ancienne.id IS NOT NULL THEN");
  log("    UPDATE documents_institution SET statut_actif=false WHERE id=v_ancienne.id;");
  log("  END IF;");
  log("  RAISE EXCEPTION 'ECHEC FORCE — test rollback Lot 2.4, ne devrait jamais persister';");
  log("END; $$;");
  log("GRANT EXECUTE ON FUNCTION deposer_nouvelle_version_document_test_echec(uuid,text,text,text,text,uuid) TO service_role;");
  log("```");

  const typeTest12 = "diplome_ordre";
  // Dépôt initial (V1) pour avoir une ligne active à "désactiver" pendant le test.
  const { error: initErr } = await deposer(typeTest12, "avant-echec.pdf", "hash-avant");
  if (initErr) {
    log(`Dépôt initial échoué (${initErr.message}) — le reste du test 12 est ignoré (NOT VERIFIED).`);
  } else {
    const avant = await lignesActives(typeTest12);
    log(`Ligne active avant l'échec forcé : id=${avant[0]?.id}, numero_version=${avant[0]?.numero_version}.`);

    const { error: echecErr } = await sb.rpc("deposer_nouvelle_version_document_test_echec", {
      p_institution_id: TEST_INSTITUTION_ID,
      p_type: typeTest12,
      p_nom: "jamais-cree.pdf",
      p_storage_path: `${TEST_INSTITUTION_ID}/${typeTest12}/jamais-cree.pdf`,
      p_hash_integrite: "hash-jamais",
      p_soumis_par_membre_id: TEST_MEMBRE_ID,
    });
    log(`Résultat de l'appel forcé à échouer : error=${echecErr?.message ?? "AUCUNE (❌ inattendu — l'exception aurait dû se propager)"}`);

    const apres = await lignesActives(typeTest12);
    log(`Ligne active après l'échec forcé : id=${apres[0]?.id}, numero_version=${apres[0]?.numero_version} (ATTENDU : IDENTIQUE à "avant" — la désactivation a dû être annulée avec le reste de la transaction).`);
    const rollbackOk = apres[0]?.id === avant[0]?.id && apres[0]?.numero_version === avant[0]?.numero_version;
    log(rollbackOk ? "✅ PASS — rollback confirmé, aucune moitié d'opération n'a persisté." : "❌ FAIL — la désactivation a persisté malgré l'échec, garantie d'atomicité rompue.");
  }
  log("");
  log("SQL à exécuter APRÈS ce test (nettoyage, une fois) :");
  log("```sql");
  log("DROP FUNCTION IF EXISTS deposer_nouvelle_version_document_test_echec(uuid,text,text,text,text,uuid);");
  log("```");

  const outPath = path.join(ROOT, "scripts", "verify-documents-concurrency-report.md");
  fs.writeFileSync(outPath, lignes.join("\n") + "\n", "utf8");
  console.log(`\nRapport écrit dans ${outPath}`);
}

main().catch((e) => {
  console.error("Échec du script :", e);
  process.exit(1);
});
