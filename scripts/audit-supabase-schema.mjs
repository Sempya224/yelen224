#!/usr/bin/env node
/**
 * AUDIT STATIQUE — alignement code <-> schéma Supabase réel
 * Projet : Yelen224 — Phase 2 (audit code sur disque)
 *
 * Scanne app/ (et lib/) pour tout appel supabase.from("table") / supabase.rpc("fn"),
 * extrait les colonnes utilisées dans la chaîne (.select/.insert/.update/.eq/...),
 * et compare au schéma réel confirmé le 07/07/2026 (CLAUDE.md, section /schema).
 *
 * NE MODIFIE AUCUN FICHIER SOURCE. Produit uniquement un rapport Markdown.
 * Usage : node scripts/audit-supabase-schema.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_DIRS = ["app", "lib"];
const REPORT_PATH = path.join(ROOT, "scripts", "audit-schema-report.md");

/* ================================================================
 * SCHÉMA RÉEL — confirmé par SELECT information_schema.columns exécuté
 * par Bryan le 09/07/2026 (complète l'audit du 07/07/2026, CLAUDE.md).
 * Les 14 tables sont confirmées exhaustivement (`exhaustive: true`) ;
 * le mode `exhaustive: false` (verdict ⚠️) n'est conservé que pour de
 * futures tables non encore auditées.
 * ================================================================ */
const SCHEMA = {
  users: {
    exhaustive: true, // SELECT direct du 07/07/2026
    columns: [
      "id", "nom", "prenom", "email", "date_naissance", "adresse", "ville",
      "photo_url", "biometrie_activee", "onboarding_complete",
      "cree_le", "mis_a_jour_le", "phone",
    ],
  },
  annonces: {
    exhaustive: true,
    columns: [
      "id", "institution_id", "titre", "contenu", "publiee",
      "date_debut", "date_fin", "cree_le", "mis_a_jour_le",
    ],
  },
  admins: {
    exhaustive: true,
    columns: [
      "id", "nom", "email", "mot_de_passe_hash", "type", "actif",
      "cree_le", "mis_a_jour_le",
    ],
  },
  avis: {
    exhaustive: true,
    columns: [
      "id", "citoyen_id", "institution_id", "rdv_id", "note", "commentaire",
      "cree_le",
    ],
  },
  disponibilites: {
    exhaustive: true,
    columns: [
      "id", "institution_id", "jour_semaine", "heure_debut", "heure_fin",
      "capacite", "actif", "cree_le",
    ],
  },
  documents_institution: {
    exhaustive: true,
    columns: ["id", "institution_id", "nom", "url", "type", "cree_le"],
  },
  institutions: {
    exhaustive: true,
    columns: [
      "id", "nom", "type", "email", "mot_de_passe_hash", "telephone",
      "adresse", "ville", "pays", "description", "logo_url", "statut",
      "plan", "badge_verifie", "latitude", "longitude", "horaires", "services",
      "cree_le", "mis_a_jour_le",
    ],
  },
  logs_admin: {
    exhaustive: true,
    columns: [
      "id", "admin_id", "action", "cible_type", "cible_id", "details", "cree_le",
    ],
  },
  messages: {
    exhaustive: true,
    columns: [
      "id", "expediteur_citoyen_id", "expediteur_institution_id",
      "destinataire_citoyen_id", "destinataire_institution_id", "contenu", "lu",
      "cree_le",
    ],
  },
  notifications: {
    exhaustive: true,
    columns: [
      "id", "citoyen_id", "institution_id", "titre", "message", "type", "lu",
      "lien", "cree_le",
    ],
  },
  rdv: {
    exhaustive: true,
    columns: [
      "id", "citoyen_id", "institution_id", "service", "date_rdv", "heure_rdv",
      "statut", "motif_refus", "qr_code", "qr_valide", "qr_scanne_le", "notes",
      "cree_le", "mis_a_jour_le",
    ],
  },
  rdv_alertes: {
    exhaustive: true,
    columns: ["id", "institution_id", "rdv_id", "message", "lu", "cree_le"],
  },
  services_payants: {
    exhaustive: true,
    columns: [
      "id", "institution_id", "nom", "description", "prix", "devise", "actif",
      "cree_le",
    ],
  },
  signalements: {
    exhaustive: true,
    columns: [
      "id", "citoyen_id", "institution_id", "rdv_id", "titre", "description",
      "statut", "traite_par", "traite_le", "cree_le", "mis_a_jour_le",
    ],
  },
};

// Fonctions réelles dans public, confirmées par SELECT pg_proc exécuté par
// Bryan le 09/07/2026 : UNE seule fonction existe, et c'est un trigger
// (retour "trigger", non appelable via .rpc()).
const KNOWN_RPCS = new Set(["update_mis_a_jour_le"]);

/* ================================================================
 * Méthodes PostgREST : classification pour l'extraction de colonnes
 * ================================================================ */
const FILTER_METHODS = new Set([
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in",
  "contains", "containedBy", "rangeGt", "rangeGte", "rangeLt", "rangeLte",
  "rangeAdjacent", "overlaps", "textSearch", "not", "filter", "order",
]);
const PAYLOAD_METHODS = new Set(["insert", "update", "upsert"]);
const IGNORED_METHODS = new Set([
  "delete", "select", "single", "maybeSingle", "limit", "range", "csv",
  "throwOnError", "abortSignal", "returns", "then", "match", "or", "on",
  "subscribe", "count", "head", "explain",
]);

/* ================================================================
 * Utilitaires de parsing (analyse textuelle avec gestion des
 * chaînes, template literals et commentaires)
 * ================================================================ */

function skipWsAndComments(src, i) {
  const n = src.length;
  while (i < n) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") { i++; continue; }
    if (c === "/" && src[i + 1] === "/") {
      while (i < n && src[i] !== "\n") i++;
      continue;
    }
    if (c === "/" && src[i + 1] === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++;
      i += 2;
      continue;
    }
    break;
  }
  return i;
}

/** À partir d'un '(' en position i, renvoie [contenu, index après ')'] ou null. */
function extractParens(src, i) {
  if (src[i] !== "(") return null;
  const n = src.length;
  let depth = 0;
  let j = i;
  let quote = null; // ' " `
  while (j < n) {
    const c = src[j];
    if (quote) {
      if (c === "\\") { j += 2; continue; }
      if (c === quote) quote = null;
      j++;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { quote = c; j++; continue; }
    if (c === "/" && src[j + 1] === "/") { while (j < n && src[j] !== "\n") j++; continue; }
    if (c === "/" && src[j + 1] === "*") {
      j += 2;
      while (j < n && !(src[j] === "*" && src[j + 1] === "/")) j++;
      j += 2;
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return [src.slice(i + 1, j), j + 1];
    }
    j++;
  }
  return null;
}

/** Première chaîne littérale au début de `arg`, sinon null.
 *  Accepte les template literals SANS interpolation `${...}`. */
function firstStringLiteral(arg) {
  const m = /^\s*(['"`])((?:\\.|(?!\1).)*)\1/s.exec(arg);
  if (!m) return null;
  if (m[1] === "`" && m[2].includes("${")) return null; // interpolé => dynamique
  return m[2];
}

/** Découpe sur les virgules de premier niveau (hors () [] {} et chaînes). */
function splitTop(str) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let cur = "";
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (quote) {
      cur += c;
      if (c === "\\") { cur += str[i + 1] ?? ""; i++; continue; }
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"' || c === "`") { quote = c; cur += c; continue; }
    if (c === "(" || c === "[" || c === "{") depth++;
    if (c === ")" || c === "]" || c === "}") depth--;
    if (c === "," && depth === 0) { parts.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim() !== "") parts.push(cur);
  return parts;
}

/** Clés de premier niveau d'un littéral objet { ... }. */
function parseObjectLiteralKeys(text) {
  const res = { keys: new Set(), dynamic: false, notes: [] };
  const s = text.trim();
  if (!s.startsWith("{")) { res.dynamic = true; return res; }
  const inner = s.slice(1, s.lastIndexOf("}"));
  for (const rawPart of splitTop(inner)) {
    const part = rawPart.trim();
    if (part === "") continue;
    if (part.startsWith("...")) {
      res.dynamic = true;
      res.notes.push(`spread \`${part.slice(0, 40)}\``);
      continue;
    }
    if (part.startsWith("[")) {
      res.dynamic = true;
      res.notes.push("clé calculée `[...]`");
      continue;
    }
    let m = /^(['"])((?:\\.|(?!\1).)*)\1\s*:/.exec(part);
    if (m) { res.keys.add(m[2]); continue; }
    m = /^([A-Za-z_$][\w$]*)\s*(?::|$)/.exec(part);
    if (m) { res.keys.add(m[1]); continue; }
    res.dynamic = true;
    res.notes.push(`fragment non reconnu \`${part.slice(0, 40)}\``);
  }
  return res;
}

/** Payload d'un insert/update/upsert : objet, tableau d'objets, ou dynamique. */
function parsePayloadKeys(arg) {
  const s = arg.trim();
  if (s.startsWith("[")) {
    const res = { keys: new Set(), dynamic: false, notes: [] };
    const inner = s.slice(1, s.lastIndexOf("]"));
    for (const part of splitTop(inner)) {
      const t = part.trim();
      if (t === "") continue;
      if (t.startsWith("{")) {
        const r = parseObjectLiteralKeys(t);
        r.keys.forEach((k) => res.keys.add(k));
        if (r.dynamic) res.dynamic = true;
        res.notes.push(...r.notes);
      } else {
        res.dynamic = true;
        res.notes.push(`élément de tableau non littéral \`${t.slice(0, 40)}\``);
      }
    }
    return res;
  }
  if (s.startsWith("{")) return parseObjectLiteralKeys(s);
  return {
    keys: new Set(),
    dynamic: true,
    notes: [`payload non littéral \`${s.slice(0, 60).replace(/\s+/g, " ")}\``],
  };
}

/**
 * Parse une chaîne de sélection PostgREST (arg de .select()).
 * Renvoie des "usages" : { table, column } — `table` peut être une relation
 * imbriquée (nom de table, alias FK ou nom de colonne FK).
 */
function parseSelectString(str, table, usages, notes) {
  for (const raw of splitTop(str)) {
    let item = raw.replace(/\s+/g, "");
    if (!item || item === "*") continue;
    if (item.startsWith("...")) item = item.slice(3); // spread de relation
    // alias:reste (le premier ':' hors parenthèses)
    let depth = 0;
    for (let i = 0; i < item.length; i++) {
      const c = item[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      else if (c === ":" && depth === 0) { item = item.slice(i + 1); break; }
    }
    const parenIdx = item.indexOf("(");
    if (parenIdx === -1) {
      // colonne simple ; retirer cast éventuel ::type et hint !
      const col = item.split("::")[0].split("!")[0];
      if (col && col !== "*" && col !== "count") usages.push({ table, column: col, kind: "select" });
      continue;
    }
    // relation imbriquée : nom!hint(inner)
    const head = item.slice(0, parenIdx);
    const relName = head.split("!")[0];
    const inner = item.slice(parenIdx + 1, item.lastIndexOf(")"));
    usages.push({ table, column: null, relation: relName, kind: "embed" });
    if (SCHEMA[relName]) {
      parseSelectString(inner, relName, usages, notes);
    } else {
      notes.push(
        `relation imbriquée \`${relName}(${inner.slice(0, 60)})\` : \`${relName}\` n'est pas un nom de table connu ` +
        `(peut être un alias de FK — colonnes internes non vérifiées)`
      );
    }
  }
}

/** Colonnes citées dans un .or("a.eq.x,and(b.gte.y)") */
function parseOrString(str, table, usages) {
  const re = /(^|[(,])\s*([A-Za-z_][\w]*)\s*\.(?:not\.)?(?:eq|neq|gt|gte|lt|lte|like|ilike|is|in|cs|cd|ov|fts|plfts|phfts|wfts|match|imatch)\./g;
  let m;
  while ((m = re.exec(str)) !== null) {
    usages.push({ table, column: m[2], kind: "or" });
  }
}

/** Colonne éventuellement préfixée par une relation : "institutions.ville" */
function pushFilterColumn(colStr, table, usages, notes) {
  if (colStr.includes(".")) {
    const [rel, col] = colStr.split(".", 2);
    if (SCHEMA[rel]) {
      usages.push({ table: rel, column: col, kind: "filter(embed)" });
    } else {
      notes.push(`filtre sur relation \`${colStr}\` : \`${rel}\` n'est pas une table connue`);
    }
    return;
  }
  usages.push({ table, column: colStr, kind: "filter" });
}

/* ================================================================
 * Extraction des chaînes d'appel .from(...) / .rpc(...)
 * ================================================================ */

function parseChain(src, startIdx) {
  // startIdx = index juste après la ')' fermante de .from(...)
  const calls = [];
  let i = startIdx;
  for (;;) {
    let j = skipWsAndComments(src, i);
    if (src[j] !== ".") break;
    j = skipWsAndComments(src, j + 1);
    const m = /^[A-Za-z_$][\w$]*/.exec(src.slice(j));
    if (!m) break;
    const name = m[0];
    j += name.length;
    j = skipWsAndComments(src, j);
    if (src[j] !== "(") break; // accès propriété (.data, .error...) => fin de chaîne
    const ext = extractParens(src, j);
    if (!ext) break;
    calls.push({ name, arg: ext[0] });
    i = ext[1];
  }
  return calls;
}

function lineOf(src, idx) {
  let line = 1;
  for (let i = 0; i < idx; i++) if (src[i] === "\n") line++;
  return line;
}

function analyzeFile(filePath, src) {
  const result = { file: filePath, fromCalls: [], rpcCalls: [], storageBuckets: [] };

  // ---- .from(...) ----
  const fromRe = /\.from\s*\(/g;
  let m;
  while ((m = fromRe.exec(src)) !== null) {
    const openIdx = m.index + m[0].length - 1;
    const before = src.slice(Math.max(0, m.index - 60), m.index);
    // Exclure Array.from(...) / Uint8Array.from(...) etc. — JavaScript natif, pas Supabase
    if (/Array\s*$/.test(before)) continue;
    // Exclure supabase.storage.from('bucket')
    const isStorage = /(?:\.\s*storage|\bstorage)\s*$/.test(before);
    const ext = extractParens(src, openIdx);
    if (!ext) continue;
    const [argText, afterIdx] = ext;
    const tableName = firstStringLiteral(argText);
    const line = lineOf(src, m.index);

    if (isStorage) {
      result.storageBuckets.push({ line, bucket: tableName ?? argText.trim().slice(0, 40) });
      continue;
    }

    const call = {
      line,
      table: tableName,
      dynamicTable: tableName === null ? argText.trim().slice(0, 60) : null,
      usages: [], // { table, column, relation?, kind }
      notes: [],
      methods: [],
    };

    const chain = parseChain(src, afterIdx);
    for (const { name, arg } of chain) {
      call.methods.push(name);
      if (name === "select") {
        const sel = firstStringLiteral(arg);
        if (sel !== null && tableName) {
          parseSelectString(sel, tableName, call.usages, call.notes);
        } else if (arg.trim() !== "" && sel === null) {
          call.notes.push(`\`.select(${arg.trim().slice(0, 40)})\` : argument non littéral, colonnes non analysées`);
        }
      } else if (PAYLOAD_METHODS.has(name)) {
        if (!tableName) continue;
        const payload = parsePayloadKeys(arg);
        payload.keys.forEach((k) =>
          call.usages.push({ table: tableName, column: k, kind: name })
        );
        if (payload.dynamic) {
          call.notes.push(
            `\`.${name}(...)\` : payload partiellement/totalement dynamique — colonnes non analysables statiquement` +
            (payload.notes.length ? ` (${payload.notes.join("; ")})` : "")
          );
        }
      } else if (FILTER_METHODS.has(name)) {
        const col = firstStringLiteral(arg);
        if (col !== null && tableName) {
          pushFilterColumn(col, tableName, call.usages, call.notes);
        } else if (col === null) {
          call.notes.push(`\`.${name}(${arg.trim().slice(0, 40)})\` : premier argument non littéral`);
        }
      } else if (name === "match") {
        if (!tableName) continue;
        const r = parseObjectLiteralKeys(arg);
        r.keys.forEach((k) => call.usages.push({ table: tableName, column: k, kind: "match" }));
        if (r.dynamic) call.notes.push("`.match(...)` : objet partiellement dynamique");
      } else if (name === "or") {
        const s = firstStringLiteral(arg);
        if (s !== null && tableName) parseOrString(s, tableName, call.usages);
      }
      // autres méthodes : ignorées
    }
    result.fromCalls.push(call);
  }

  // ---- .rpc(...) ----
  const rpcRe = /\.rpc\s*\(/g;
  while ((m = rpcRe.exec(src)) !== null) {
    const openIdx = m.index + m[0].length - 1;
    const ext = extractParens(src, openIdx);
    if (!ext) continue;
    const [argText] = ext;
    const fnName = firstStringLiteral(argText);
    const parts = splitTop(argText);
    let params = [];
    let paramsDynamic = false;
    if (parts.length > 1) {
      const p = parseObjectLiteralKeys(parts.slice(1).join(","));
      params = [...p.keys];
      paramsDynamic = p.dynamic;
    }
    result.rpcCalls.push({
      line: lineOf(src, m.index),
      fn: fnName ?? `(dynamique: ${argText.trim().slice(0, 40)})`,
      params,
      paramsDynamic,
    });
  }

  return result;
}

/* ================================================================
 * Validation contre le schéma
 * ================================================================ */

function verdictTable(table) {
  return SCHEMA[table]
    ? { status: "OK", label: "✅ existe" }
    : { status: "MISSING", label: "❌ **N'EXISTE PAS** (liste des 14 tables exhaustive au 07/07/2026)" };
}

function verdictColumn(table, column) {
  const t = SCHEMA[table];
  if (!t) return { status: "SKIP", label: "— (table inexistante)" };
  if (t.columns.includes(column)) return { status: "OK", label: "✅" };
  return t.exhaustive
    ? { status: "MISSING", label: "❌ n'existe pas (liste de colonnes exhaustive)" }
    : { status: "UNKNOWN", label: "⚠️ absente des colonnes documentées — à confirmer par SQL" };
}

/* ================================================================
 * Scan + rapport
 * ================================================================ */

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === ".next") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
}

const files = [];
for (const d of SCAN_DIRS) {
  const dir = path.join(ROOT, d);
  if (fs.existsSync(dir)) walk(dir, files);
}
files.sort();

const analyses = [];
for (const f of files) {
  const src = fs.readFileSync(f, "utf8");
  const a = analyzeFile(path.relative(ROOT, f).replace(/\\/g, "/"), src);
  if (a.fromCalls.length || a.rpcCalls.length || a.storageBuckets.length) analyses.push(a);
}

/* ---- Agrégats pour le résumé ---- */
const missingTables = new Map();   // table -> Set(files)
const badColumns = new Map();      // "table" -> Map(column -> {status, files:Set})
const rpcAll = new Map();          // fn -> Set(files)
let totalCalls = 0;

for (const a of analyses) {
  for (const c of a.fromCalls) {
    totalCalls++;
    if (c.table && !SCHEMA[c.table]) {
      if (!missingTables.has(c.table)) missingTables.set(c.table, new Set());
      missingTables.get(c.table).add(a.file);
    }
    for (const u of c.usages) {
      if (!u.column) continue;
      const v = verdictColumn(u.table, u.column);
      if (v.status === "MISSING" || v.status === "UNKNOWN") {
        if (!badColumns.has(u.table)) badColumns.set(u.table, new Map());
        const tm = badColumns.get(u.table);
        if (!tm.has(u.column)) tm.set(u.column, { status: v.status, files: new Set() });
        tm.get(u.column).files.add(a.file);
      }
    }
  }
  for (const r of a.rpcCalls) {
    if (!rpcAll.has(r.fn)) rpcAll.set(r.fn, new Set());
    rpcAll.get(r.fn).add(a.file);
  }
}

/* ---- Génération Markdown ---- */
const L = [];
const today = new Date().toISOString().slice(0, 10);
L.push(`# Audit alignement code ↔ schéma Supabase — Yelen224`);
L.push(``);
L.push(`Généré le ${today} par \`scripts/audit-supabase-schema.mjs\` (analyse statique, aucune modification).`);
L.push(`Référence : 14 tables confirmées le 07/07/2026 (CLAUDE.md, /schema) ; colonnes et fonctions`);
L.push(`confirmées par SELECT information_schema.columns / pg_proc exécutés par Bryan le 09/07/2026.`);
L.push(``);
L.push(`## Légende`);
L.push(``);
L.push(`- ✅ table/colonne présente dans le schéma confirmé`);
L.push(`- ❌ **certain** : table hors des 14 tables, colonne absente du schéma exhaustif confirmé en base, ou RPC absente de \`pg_proc\``);
L.push(``);
L.push(`Les 14 tables sont confirmées exhaustivement (colonnes + fonctions) — plus aucun verdict « à confirmer ».`);
L.push(``);
L.push(`### Limites de l'analyse statique`);
L.push(``);
L.push(`- Seuls les littéraux de chaîne sont analysés ; les tables/colonnes passées via variables sont signalées « dynamiques », pas validées.`);
L.push(`- Les chaînes de requête coupées (\`const q = supabase.from('x'); ... q.eq(...)\`) ne rattachent que la partie contiguë.`);
L.push(`- Les relations imbriquées dont le nom n'est pas une table connue (alias de FK) sont signalées sans validation des colonnes internes.`);
L.push(``);

/* Résumé */
L.push(`## Résumé exécutif`);
L.push(``);
L.push(`- Fichiers scannés : ${files.length} (.ts/.tsx sous app/ et lib/)`);
L.push(`- Fichiers utilisant Supabase (from/rpc/storage) : ${analyses.length}`);
L.push(`- Appels \`.from()\` analysés : ${totalCalls}`);
L.push(``);
if (missingTables.size) {
  L.push(`### ❌ Tables appelées qui N'EXISTENT PAS en base (${missingTables.size})`);
  L.push(``);
  L.push(`| Table fantôme | Fichiers |`);
  L.push(`|---|---|`);
  for (const [t, fset] of [...missingTables.entries()].sort()) {
    L.push(`| \`${t}\` | ${[...fset].map((f) => `\`${f}\``).join("<br>")} |`);
  }
  L.push(``);
} else {
  L.push(`### ✅ Aucune table fantôme détectée`);
  L.push(``);
}
if (badColumns.size) {
  L.push(`### Colonnes problématiques par table réelle`);
  L.push(``);
  L.push(`| Table | Colonne | Verdict | Fichiers |`);
  L.push(`|---|---|---|---|`);
  for (const [t, cols] of [...badColumns.entries()].sort()) {
    for (const [col, info] of [...cols.entries()].sort()) {
      const lab = info.status === "MISSING" ? "❌ n'existe pas" : "⚠️ à confirmer";
      L.push(`| \`${t}\` | \`${col}\` | ${lab} | ${[...info.files].map((f) => `\`${f}\``).join("<br>")} |`);
    }
  }
  L.push(``);
}
if (rpcAll.size) {
  L.push(`### Fonctions RPC appelées (${rpcAll.size})`);
  L.push(``);
  L.push(`| RPC | Verdict | Fichiers |`);
  L.push(`|---|---|---|`);
  for (const [fn, fset] of [...rpcAll.entries()].sort()) {
    const v = KNOWN_RPCS.has(fn)
      ? "✅ existe"
      : "❌ n'existe pas (pg_proc confirmé le 09/07/2026)";
    L.push(`| \`${fn}\` | ${v} | ${[...fset].map((f) => `\`${f}\``).join("<br>")} |`);
  }
  L.push(``);
}

/* Détail par fichier */
L.push(`## Détail par fichier`);
L.push(``);
for (const a of analyses) {
  const fileHasIssue =
    a.fromCalls.some(
      (c) =>
        (c.table && !SCHEMA[c.table]) ||
        c.dynamicTable ||
        c.notes.length ||
        c.usages.some((u) => u.column && verdictColumn(u.table, u.column).status !== "OK")
    ) || a.rpcCalls.length > 0;
  L.push(`### ${fileHasIssue ? "🔴" : "🟢"} \`${a.file}\``);
  L.push(``);
  for (const c of a.fromCalls) {
    if (c.dynamicTable) {
      L.push(`- **L${c.line}** — \`.from(${c.dynamicTable})\` : table dynamique, non vérifiable statiquement`);
      continue;
    }
    const vt = verdictTable(c.table);
    L.push(`- **L${c.line}** — \`.from("${c.table}")\` ${vt.label} — méthodes : \`${c.methods.join(".")}\``);
    // Colonnes dédupliquées par (table,colonne), en conservant les kinds
    const seen = new Map();
    for (const u of c.usages) {
      if (!u.column) {
        if (u.relation) {
          const rv = SCHEMA[u.relation]
            ? `relation \`${u.relation}\` ✅ (table connue)`
            : `relation \`${u.relation}\` ⚠️ (pas une table connue — alias FK ?)`;
          L.push(`  - ${rv}`);
        }
        continue;
      }
      const key = `${u.table}.${u.column}`;
      if (!seen.has(key)) seen.set(key, { u, kinds: new Set() });
      seen.get(key).kinds.add(u.kind);
    }
    for (const { u, kinds } of seen.values()) {
      const v = verdictColumn(u.table, u.column);
      const prefix = u.table === c.table ? `\`${u.column}\`` : `\`${u.table}.${u.column}\``;
      L.push(`  - ${prefix} ${v.label} _(${[...kinds].join(", ")})_`);
    }
    for (const note of c.notes) L.push(`  - 📝 ${note}`);
  }
  for (const r of a.rpcCalls) {
    const p = r.params.length ? ` — params : \`${r.params.join(", ")}\`${r.paramsDynamic ? " (+dynamiques)" : ""}` : "";
    const v = KNOWN_RPCS.has(r.fn)
      ? "✅ existe"
      : "❌ **N'EXISTE PAS** (pg_proc confirmé le 09/07/2026)";
    L.push(`- **L${r.line}** — \`.rpc("${r.fn}")\` ${v}${p}`);
  }
  for (const s of a.storageBuckets) {
    L.push(`- **L${s.line}** — \`storage.from("${s.bucket}")\` (bucket Storage, hors périmètre schéma SQL)`);
  }
  L.push(``);
}

L.push(`## Statut de la vérification`);
L.push(``);
L.push(`Schéma 100 % confirmé en base (09/07/2026) : colonnes des 14 tables via`);
L.push(`\`information_schema.columns\`, fonctions via \`pg_proc\` (seule fonction : trigger`);
L.push(`\`update_mis_a_jour_le\`). Aucune vérification SQL restante pour cet audit.`);
L.push(``);

fs.writeFileSync(REPORT_PATH, L.join("\n"), "utf8");
console.log(`Rapport écrit : ${path.relative(ROOT, REPORT_PATH)}`);
console.log(`Fichiers scannés : ${files.length} | avec appels Supabase : ${analyses.length} | .from() : ${totalCalls}`);
console.log(`Tables fantômes : ${missingTables.size} | tables avec colonnes suspectes : ${badColumns.size} | RPC : ${rpcAll.size}`);
