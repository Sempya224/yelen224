#!/usr/bin/env node
/**
 * CONTRÔLE i18n — dérive entre messages/fr.json et messages/en.json
 * Projet : Yelen224 — Phase 1 i18n (décision CEO 08/08/2026)
 *
 * fr.json est la source de vérité. Une clé présente en en.json mais
 * absente en fr.json est une erreur bloquante (dérive/typo). Une clé
 * présente en fr.json mais absente en en.json est listée en informatif
 * (traduction pas encore faite — attendu tant que l'extraction complète
 * n'est pas lancée, voir CLAUDE.md /migration-i18n).
 *
 * NE MODIFIE AUCUN FICHIER. Usage : node scripts/check-i18n-keys.mjs [--strict]
 * --strict : réservé au futur chantier d'extraction complète (non utilisé
 * aujourd'hui) — ferait aussi échouer sur les clés fr non traduites en en.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STRICT = process.argv.includes("--strict");

function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, out);
    else out[key] = v;
  }
  return out;
}

const fr = flatten(JSON.parse(fs.readFileSync(path.join(ROOT, "messages", "fr.json"), "utf8")));
const en = flatten(JSON.parse(fs.readFileSync(path.join(ROOT, "messages", "en.json"), "utf8")));

const frKeys = new Set(Object.keys(fr));
const enKeys = new Set(Object.keys(en));

const orphanedEn = [...enKeys].filter(k => !frKeys.has(k));
const untranslated = [...frKeys].filter(k => !enKeys.has(k));

let exitCode = 0;

if (orphanedEn.length > 0) {
  console.error(`\n[i18n] ${orphanedEn.length} clé(s) présente(s) en.json mais absente(s) de fr.json (fr = source de vérité) :`);
  for (const k of orphanedEn) console.error(`  - ${k}`);
  exitCode = 1;
}

if (untranslated.length > 0) {
  console.log(`\n[i18n] ${untranslated.length} clé(s) fr.json pas encore traduite(s) en anglais :`);
  for (const k of untranslated) console.log(`  - ${k}`);
  if (STRICT) exitCode = 1;
}

if (exitCode === 0) console.log("\n[i18n] OK — aucune dérive bloquante.");

process.exit(exitCode);
