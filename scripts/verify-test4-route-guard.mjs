#!/usr/bin/env node
/**
 * TRUST — Lot 2.4, test 4 réel : "remplacement après validation doit être
 * bloqué CÔTÉ ROUTE" (app/api/institution/documents/route.ts, pas le RPC —
 * voir docs/product/YELEN_TRUST_VERIFICATION_IMPLEMENTATION_PLAN.md
 * section 1, "ce que la fonction ne fait pas"). C'est le seul des 12+
 * scénarios qui ne peut pas être vérifié en SQL pur : la règle vit dans le
 * code de la route, pas dans la base.
 *
 * Ce script : (1) crée une institution + membre + document 'valide' de
 * test via service_role, (2) fabrique un vrai cookie de session JWT
 * institution (même secret/issuer/audience que lib/institutionAuth.ts),
 * (3) appelle réellement POST /api/institution/documents contre le
 * serveur dev EN COURS D'EXÉCUTION, (4) vérifie le 409 attendu, (5)
 * nettoie tout ce qu'il a créé.
 *
 * ⚠️ PRÉREQUIS : le serveur dev doit tourner (`npm run dev` dans un autre
 * terminal, port 3000 par défaut). À exécuter manuellement par Bryan
 * (jamais par Claude Code, cf. CLAUDE.md) :
 *
 *   node scripts/verify-test4-route-guard.mjs
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(ROOT, ".env.local");
if (fs.existsSync(envPath)) {
  for (const rawLine of fs.readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const INSTITUTION_JWT_SECRET = process.env.INSTITUTION_JWT_SECRET;
const APP_URL = process.env.APP_URL || "http://localhost:3000";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !INSTITUTION_JWT_SECRET) {
  console.error("Manque NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ou INSTITUTION_JWT_SECRET dans .env.local — arrêt.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const lignes = [];
const log = (s = "") => { lignes.push(s); console.log(s); };

async function main() {
  log(`# Test 4 (route guard) — généré le ${new Date().toISOString()}`);
  log(`Cible : ${APP_URL}/api/institution/documents`);
  log("");
  log("**Rappel : nécessite le serveur dev démarré séparément (`npm run dev`).**");
  log("");

  // 1. Institution de test éphémère.
  const instId = randomUUID();
  const { error: instErr } = await sb.from("institutions").insert({
    id: instId,
    name: "Test Route Guard (jetable)",
    email: `test-route-guard-${instId}@example.invalid`,
    statut: "en_attente",
    statut_juridique: "prive_formel",
    plan: "essentiel",
    secteur: "commerce",
    slug: `test-route-guard-${instId.slice(0, 8)}`,
  });
  if (instErr) { log(`ERREUR création institution : ${instErr.message}`); return cleanup(instId, null); }
  log(`Institution de test créée : ${instId}`);

  // 2. Membre admin (seul rôle avec documents_institutionnels.write).
  const { data: membre, error: membreErr } = await sb
    .from("institution_membres")
    .insert({ institution_id: instId, prenom: "Test", nom: "RouteGuard", role: "admin", actif: true, compte_principal: true })
    .select("id")
    .single();
  if (membreErr) { log(`ERREUR création membre : ${membreErr.message}`); return cleanup(instId, null); }
  log(`Membre de test créé : ${membre.id}`);

  // 3. Document déjà 'valide' pour le type testé (insertion directe,
  // l'immuabilité ne bloque que UPDATE/DELETE, jamais INSERT).
  const { error: docErr } = await sb.from("documents_institution").insert({
    institution_id: instId,
    type: "rccm",
    nom: "rccm-valide.pdf",
    storage_path: `${instId}/rccm/deja-valide.pdf`,
    statut: "valide",
    soumis_le: new Date().toISOString(),
    examine_le: new Date().toISOString(),
    numero_version: 1,
    statut_actif: true,
  });
  if (docErr) { log(`ERREUR création document 'valide' : ${docErr.message}`); return cleanup(instId, membre.id); }
  log("Document 'rccm' créé avec statut='valide'.");
  log("");

  // 4. Fabrication du cookie de session — même secret/issuer/audience que lib/institutionAuth.ts.
  const secret = new TextEncoder().encode(INSTITUTION_JWT_SECRET);
  const token = await new SignJWT({ institutionId: instId, membreId: membre.id, role: "admin" })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("yelen224-institution")
    .setAudience("yelen224-institution-dashboard")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(secret);
  log("Cookie de session JWT fabriqué (5 min de validité).");

  // 5. Appel HTTP réel — tentative de renvoi sur un document déjà 'valide'.
  const form = new FormData();
  form.set("type", "rccm");
  form.set("file", new File([Buffer.from("%PDF-1.4 test")], "renvoi-interdit.pdf", { type: "application/pdf" }));

  let res;
  try {
    res = await fetch(`${APP_URL}/api/institution/documents`, {
      method: "POST",
      headers: { Cookie: `yelen224_institution_session=${token}` },
      body: form,
    });
  } catch (e) {
    log(`ERREUR réseau — le serveur dev tourne-t-il sur ${APP_URL} ? (${e.message})`);
    return cleanup(instId, membre.id);
  }

  const body = await res.json().catch(() => null);
  log(`Statut HTTP reçu : ${res.status}`);
  log(`Corps de réponse : ${JSON.stringify(body)}`);
  log("");
  const attendu = res.status === 409 && typeof body?.error === "string" && body.error.includes("déjà en cours d'examen ou validé");
  log(attendu
    ? "✅ PASS — la route a bien bloqué le renvoi avec 409, avant tout appel au RPC."
    : "❌ FAIL — statut ou message inattendu, à investiguer avant de considérer le test 4 validé.");

  await cleanup(instId, membre.id);
}

async function cleanup(instId, membreId) {
  log("");
  log("## Nettoyage");
  if (instId) {
    const { error: e1 } = await sb.from("documents_institution").delete().eq("institution_id", instId);
    // Le trigger d'immuabilité bloque ce DELETE sans échappatoire — attendu,
    // documenté ici plutôt que de le contourner silencieusement.
    if (e1) log(`documents_institution non supprimé automatiquement (attendu, table immuable) : ${e1.message}. Nettoyage manuel requis (voir ci-dessous).`);
    if (membreId) {
      const { error: e2 } = await sb.from("institution_membres").delete().eq("id", membreId);
      if (e2) log(`institution_membres non supprimé : ${e2.message}`);
    }
    const { error: e3 } = await sb.from("institutions").delete().eq("id", instId);
    if (e3) log(`institutions non supprimé : ${e3.message}`);
  }
  log("");
  log("Si des lignes subsistent (cas normal pour documents_institution,");
  log("immuable), nettoyage manuel dans le SQL Editor :");
  log("```sql");
  log("BEGIN;");
  log("SET LOCAL app.autoriser_correction_documents_institution = 'on';");
  log(`DELETE FROM documents_institution WHERE institution_id = '${instId}';`);
  log(`DELETE FROM institution_membres WHERE institution_id = '${instId}';`);
  log(`DELETE FROM institutions WHERE id = '${instId}';`);
  log("COMMIT;");
  log("```");

  const outPath = path.join(ROOT, "scripts", "verify-test4-route-guard-report.md");
  fs.writeFileSync(outPath, lignes.join("\n") + "\n", "utf8");
  console.log(`\nRapport écrit dans ${outPath}`);
}

main().catch((e) => {
  console.error("Échec du script :", e);
  process.exit(1);
});
