#!/usr/bin/env node
/**
 * TRUST — Lot 2.4, item "1. Storage" (inventaire préalable, CEO exigé
 * avant toute migration). Script STRICTEMENT EN LECTURE SEULE — aucun
 * upload/update/delete, aucune écriture DB. À exécuter manuellement par
 * Bryan (jamais par Claude Code, cf. CLAUDE.md — Claude n'exécute jamais
 * de commande terminal touchant Supabase) :
 *
 *   node scripts/verify-documents-bucket.mjs
 *
 * Nécessite .env.local avec NEXT_PUBLIC_SUPABASE_URL et
 * SUPABASE_SERVICE_ROLE_KEY déjà présents (mêmes variables que le reste
 * du projet). Produit scripts/verify-documents-bucket-report.md — coller
 * son contenu dans docs/product/YELEN_TRUST_VERIFICATION_MIGRATION_REPORT.md,
 * section "État réel avant migration".
 *
 * Ce script répond à l'exigence CEO Lot 2.4 : existence du bucket,
 * visibilité, chemins/objets réels, correspondance DB <-> Storage. Il ne
 * peut PAS lister les policies RLS sur storage.objects (l'API Storage JS
 * n'expose pas ça) — la requête SQL correspondante est fournie à la fin
 * du rapport généré, à exécuter séparément dans le SQL Editor Supabase.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

// Charge .env.local sans dépendance externe (évite d'ajouter dotenv comme
// dépendance juste pour ce script ponctuel).
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

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Manque NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY dans .env.local — arrêt.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const lignes = [];
const log = (s = "") => { lignes.push(s); console.log(s); };

async function listerRecursif(bucket, prefix = "", acc = []) {
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) return { error, acc };
  for (const entry of data ?? []) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Un "dossier" Storage n'a pas d'id — on descend récursivement dedans.
    if (entry.id === null) {
      await listerRecursif(bucket, fullPath, acc);
    } else {
      acc.push({ path: fullPath, size: entry.metadata?.size ?? null, updated_at: entry.updated_at ?? null });
    }
  }
  return { error: null, acc };
}

async function main() {
  log(`# Inventaire bucket "documents" — généré le ${new Date().toISOString()}`);
  log("");
  log("**Lecture seule — aucune écriture effectuée par ce script.**");
  log("");

  // 1. Existence + visibilité du bucket.
  log("## 1. Existence et visibilité");
  const { data: buckets, error: bucketsErr } = await sb.storage.listBuckets();
  if (bucketsErr) {
    log(`ERREUR listBuckets(): ${bucketsErr.message}`);
  } else {
    const bucket = (buckets ?? []).find((b) => b.name === "documents");
    if (!bucket) {
      log("**Bucket `documents` INTROUVABLE** — confirme le constat de CLAUDE.md (`/actions-manuelles-en-attente`) : le bucket n'a jamais été créé. Aucun fichier ne peut donc exister en dessous. À créer par Bryan (Public décoché) avant toute migration réelle du Lot 2.4.");
    } else {
      log(`Bucket trouvé : id=${bucket.id}, public=${bucket.public}, created_at=${bucket.created_at}, file_size_limit=${bucket.file_size_limit ?? "aucun"}, allowed_mime_types=${JSON.stringify(bucket.allowed_mime_types ?? "aucun")}`);
      if (bucket.public) {
        log("⚠️ ALERTE : bucket marqué PUBLIC — attendu privé (documents KYC institution). À corriger avant toute migration réelle si confirmé.");
      }
    }
  }
  log("");

  // 2. Objets réels présents (récursif).
  log("## 2. Objets réels présents dans le bucket");
  const { error: listErr, acc: objets } = await listerRecursif("documents");
  if (listErr) {
    log(`ERREUR list(): ${listErr.message} — soit le bucket n'existe pas, soit une erreur de permission.`);
  } else if (objets.length === 0) {
    log("Aucun objet trouvé — cohérent avec l'hypothèse d'un bucket jamais réellement utilisé (aucune route n'a jamais pu écrire dessus avant sa création).");
  } else {
    log(`${objets.length} objet(s) trouvé(s) :`);
    for (const o of objets) log(`- \`${o.path}\` (taille=${o.size ?? "?"} octets, modifié=${o.updated_at ?? "?"})`);
  }
  log("");

  // 3. Lignes documents_institution — pour correspondance DB <-> Storage.
  log("## 3. Lignes `documents_institution` (correspondance DB <-> Storage)");
  const { data: rows, error: rowsErr } = await sb
    .from("documents_institution")
    .select("id, institution_id, type, nom, url, statut, soumis_le")
    .order("institution_id", { ascending: true });
  if (rowsErr) {
    log(`ERREUR lecture documents_institution: ${rowsErr.message}`);
  } else if (!rows || rows.length === 0) {
    log("Aucune ligne dans `documents_institution` — table vide, migration triviale.");
  } else {
    log(`${rows.length} ligne(s) trouvée(s) :`);
    for (const r of rows) {
      const cheminExiste = (objets || []).some((o) => o.path === r.url);
      log(`- id=${r.id} institution_id=${r.institution_id} type=${r.type} statut=${r.statut} url=\`${r.url}\` soumis_le=${r.soumis_le} → fichier Storage correspondant trouvé : ${cheminExiste ? "OUI" : "NON"}`);
    }
    const orphelinesDB = rows.filter((r) => !(objets || []).some((o) => o.path === r.url));
    const orphelinsStorage = (objets || []).filter((o) => !rows.some((r) => r.url === o.path));
    log("");
    log(`**Lignes DB sans fichier Storage correspondant : ${orphelinesDB.length}.**`);
    log(`**Fichiers Storage sans ligne DB correspondante : ${orphelinsStorage.length}.**`);
    log("Toute incohérence trouvée ici doit être documentée dans le rapport de migration, jamais supprimée silencieusement (consigne CEO Lot 2.4, item 5).");
  }
  log("");

  // 4. Doublons résiduels (institution_id, type) — vérification de cohérence.
  log("## 4. Doublons (institution_id, type)");
  if (rows && rows.length > 0) {
    const paires = new Map();
    for (const r of rows) {
      const k = `${r.institution_id}::${r.type}`;
      paires.set(k, (paires.get(k) ?? 0) + 1);
    }
    const doublons = [...paires.entries()].filter(([, n]) => n > 1);
    if (doublons.length === 0) {
      log("Aucun doublon — attendu, la contrainte UNIQUE(institution_id,type) actuelle l'interdit déjà.");
    } else {
      log(`⚠️ ${doublons.length} doublon(s) trouvé(s) — NE DEVRAIT PAS ARRIVER avec la contrainte actuelle, à investiguer avant toute migration :`);
      for (const [k, n] of doublons) log(`- ${k} : ${n} lignes`);
    }
  }
  log("");

  log("## 5. Requête complémentaire à exécuter manuellement (SQL Editor)");
  log("Ce script ne peut pas lister les policies RLS sur `storage.objects` (hors de l'API Storage JS) :");
  log("```sql");
  log("SELECT policyname, roles, cmd, qual, with_check");
  log("FROM pg_policies WHERE schemaname='storage' AND tablename='objects';");
  log("```");
  log("Coller le résultat dans le rapport de migration.");

  const outPath = path.join(ROOT, "scripts", "verify-documents-bucket-report.md");
  fs.writeFileSync(outPath, lignes.join("\n") + "\n", "utf8");
  console.log(`\nRapport écrit dans ${outPath}`);
}

main().catch((e) => {
  console.error("Échec du script :", e);
  process.exit(1);
});
