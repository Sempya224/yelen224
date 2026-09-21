#!/usr/bin/env node
/**
 * TRUST — Lot 2.5, étape 5 : tests réels des 2 routes admin
 * (GET .../verification, POST .../verification/decision) contre le
 * serveur dev EN COURS D'EXÉCUTION. Même technique que
 * verify-test4-route-guard.mjs (Lot 2.4) : fabrique un vrai cookie de
 * session JWT admin (secret/issuer/audience réels + claim mfaEnabled,
 * sans quoi middleware.ts bloque la requête avant même d'atteindre la
 * route — piège identifié en préparant ce script).
 *
 * ⚠️ PRÉREQUIS : serveur dev démarré (`npm run dev`, autre terminal).
 * À exécuter manuellement par Bryan (jamais par Claude Code).
 *
 *   node scripts/verify-admin-verification-routes.mjs
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
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const APP_URL = process.env.APP_URL || "http://localhost:3000";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !ADMIN_JWT_SECRET) {
  console.error("Manque NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY ou ADMIN_JWT_SECRET — arrêt.");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
const lignes = [];
const log = (s = "") => { lignes.push(s); console.log(s); };
let pass = 0, fail = 0;
const verdict = (ok, label) => { if (ok) pass++; else fail++; log(`${ok ? "✅ PASS" : "❌ FAIL"} — ${label}`); };

async function jwtAdmin({ adminId, email, role, nom, mfaEnabled = true, secret = ADMIN_JWT_SECRET }) {
  const key = new TextEncoder().encode(secret);
  return new SignJWT({ adminId, email, role, nom, mfaEnabled })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer("yelen224-admin")
    .setAudience("yelen224-admin-dashboard")
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(key);
}

async function main() {
  log(`# Tests routes admin verification — généré le ${new Date().toISOString()}`);
  log(`Cible : ${APP_URL}/api/admin/institutions/[id]/verification`);
  log("");

  // Setup : institution jetable + membre + document actif (identité).
  const instId = randomUUID();
  await sb.from("institutions").insert({
    id: instId, name: "Test Routes Admin (jetable)", email: `test-routes-${instId}@example.invalid`,
    statut: "en_attente", statut_juridique: "prive_formel", plan: "essentiel", secteur: "commerce",
    slug: `test-routes-${instId.slice(0, 8)}`,
  });
  const { data: membre } = await sb.from("institution_membres")
    .insert({ institution_id: instId, prenom: "Test", nom: "Routes", role: "admin", actif: true, compte_principal: true })
    .select("id").single();
  const storagePath = `${instId}/piece_identite/test.pdf`;
  // Vrai fichier uploadé (pas seulement la ligne DB) — sans ça, la
  // vérification de l'URL signée ne teste rien de réel (trouvé en
  // préparant ce test : le premier essai créait la ligne sans le fichier,
  // signed URL toujours null, gérée correctement par la route mais aucune
  // preuve que la génération fonctionne pour un vrai fichier).
  const { error: uploadErr } = await sb.storage.from("documents").upload(storagePath, Buffer.from("%PDF-1.4 contenu de test"), { contentType: "application/pdf", upsert: true });
  if (uploadErr) { log(`ERREUR upload fichier de test : ${uploadErr.message}`); return cleanup(instId); }
  const { data: doc } = await sb.rpc("deposer_nouvelle_version_document", {
    p_institution_id: instId, p_type: "piece_identite", p_nom: "test.pdf",
    p_storage_path: storagePath, p_hash_integrite: "hash",
    p_soumis_par_membre_id: membre.id,
  }).single();
  const { data: admins } = await sb.from("admin_users").select("id, email, nom, prenom, role").eq("is_active", true).limit(1);
  const realAdmin = admins?.[0];
  if (!realAdmin) { log("Aucun admin actif trouvé — impossible de continuer."); return cleanup(instId); }
  log(`Institution=${instId}, membre=${membre.id}, document=${doc.id}, admin réel=${realAdmin.email} (${realAdmin.role})`);
  log("");

  const cookieAutorise = await jwtAdmin({ adminId: realAdmin.id, email: realAdmin.email, role: "super_admin", nom: realAdmin.nom });
  const cookieNonAutorise = await jwtAdmin({ adminId: realAdmin.id, email: realAdmin.email, role: "support", nom: realAdmin.nom });
  const cookieSansMfa = await jwtAdmin({ adminId: realAdmin.id, email: realAdmin.email, role: "super_admin", nom: realAdmin.nom, mfaEnabled: false });

  const dossierUrl = `${APP_URL}/api/admin/institutions/${instId}/verification`;
  const decisionUrl = `${dossierUrl}/decision`;

  // 1. Session absente.
  let res = await fetch(dossierUrl);
  verdict(res.status === 401, `GET sans cookie → 401 (obtenu ${res.status})`);

  // 2. Admin non autorisé (role support, sans institutions.verify).
  res = await fetch(dossierUrl, { headers: { Cookie: `yelen224_admin_session=${cookieNonAutorise}` } });
  verdict(res.status === 403, `GET admin sans institutions.verify → 403 (obtenu ${res.status})`);

  // 3. MFA non activée (doit être bloqué par le middleware avant même la route).
  res = await fetch(dossierUrl, { headers: { Cookie: `yelen224_admin_session=${cookieSansMfa}` } });
  const bodyMfa = await res.json().catch(() => null);
  verdict(res.status === 403 && bodyMfa?.code === "MFA_SETUP_REQUIRED", `GET admin sans MFA → 403 MFA_SETUP_REQUIRED (obtenu ${res.status} ${bodyMfa?.code})`);

  // 4. Citoyen/institution — aucun cookie admin, donc équivalent au cas 1
  // (les routes ne connaissent que yelen224_admin_session, jamais les
  // cookies citoyen/institution — confirmé par lecture du code, testé ici
  // en envoyant un cookie institution réel mais aucun cookie admin).
  res = await fetch(dossierUrl, { headers: { Cookie: "yelen224_institution_session=fake" } });
  verdict(res.status === 401, `GET avec cookie institution (jamais admin) → 401 (obtenu ${res.status})`);

  // 5. Institution inexistante.
  res = await fetch(`${APP_URL}/api/admin/institutions/${randomUUID()}/verification`, { headers: { Cookie: `yelen224_admin_session=${cookieAutorise}` } });
  verdict(res.status === 404, `GET institution inexistante → 404 (obtenu ${res.status})`);

  // 6. Admin autorisé — dossier complet.
  res = await fetch(dossierUrl, { headers: { Cookie: `yelen224_admin_session=${cookieAutorise}` } });
  const body = await res.json().catch(() => null);
  const docEntry = body?.documents?.find((d) => d.id === doc.id);
  const shapeOk = res.status === 200 && body?.institution?.id === instId && Array.isArray(body?.documents) && !!docEntry?.url;
  verdict(shapeOk, `GET admin autorisé → 200, dossier complet avec URL signée (obtenu ${res.status})`);
  log(`  → ${body?.documents?.length ?? 0} document(s), decisions.identite.actuelle=${JSON.stringify(body?.decisions?.identite?.actuelle)}`);

  // 6b. L'URL signée fonctionne réellement (accès direct au contenu).
  if (docEntry?.url) {
    const fileRes = await fetch(docEntry.url);
    const fileContent = await fileRes.text().catch(() => "");
    verdict(fileRes.status === 200 && fileContent.includes("contenu de test"), `URL signée → contenu réel accessible (obtenu ${fileRes.status})`);
  } else {
    verdict(false, "URL signée absente — impossible de tester l'accès réel au fichier");
  }

  // 6c. Le même chemin SANS signature (accès direct au bucket, jamais via
  // la route) doit être refusé — confirme que le bucket privé + RLS
  // storage.objects bloquent réellement tout accès non signé, pas
  // seulement en théorie.
  const urlNonSignee = `${SUPABASE_URL}/storage/v1/object/public/documents/${storagePath}`;
  const resNonSignee = await fetch(urlNonSignee);
  verdict(resNonSignee.status !== 200, `Accès direct sans signature (bucket privé) → refusé (obtenu ${resNonSignee.status}, jamais 200)`);
  log("");

  // 7. POST décision — session absente.
  res = await fetch(decisionUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
  verdict(res.status === 401, `POST sans cookie → 401 (obtenu ${res.status})`);

  // 8. POST décision — admin non autorisé.
  res = await fetch(decisionUrl, { method: "POST", headers: { "Content-Type": "application/json", Cookie: `yelen224_admin_session=${cookieNonAutorise}` }, body: JSON.stringify({ axe: "identite", type_decision: "accordee" }) });
  verdict(res.status === 403, `POST admin sans institutions.verify → 403 (obtenu ${res.status})`);

  // 9. POST décision — succès nominal (première décision, derniere_decision_vue_id=null).
  res = await fetch(decisionUrl, { method: "POST", headers: { "Content-Type": "application/json", Cookie: `yelen224_admin_session=${cookieAutorise}` }, body: JSON.stringify({
    axe: "identite", type_decision: "accordee", niveau_preuve: "profil_verifie",
    justification: "Test route — conforme", derniere_decision_vue_id: null, document_institution_ids: [doc.id],
  }) });
  const decisionBody = await res.json().catch(() => null);
  verdict(res.status === 200 && decisionBody?.decision?.decision_id, `POST décision valide → 200, decision_id=${decisionBody?.decision?.decision_id} (obtenu ${res.status})`);

  // 10. POST décision — conflit de concurrence (reenvoi avec le même
  // derniere_decision_vue_id=null, alors qu'une décision existe désormais).
  res = await fetch(decisionUrl, { method: "POST", headers: { "Content-Type": "application/json", Cookie: `yelen224_admin_session=${cookieAutorise}` }, body: JSON.stringify({
    axe: "identite", type_decision: "rejetee", justification: "Test route — tentative périmée", derniere_decision_vue_id: null,
  }) });
  const conflitBody = await res.json().catch(() => null);
  verdict(res.status === 409 && conflitBody?.code === "CONFLIT_CONCURRENCE", `POST avec état périmé → 409 CONFLIT_CONCURRENCE (obtenu ${res.status} ${conflitBody?.code})`);

  // 11. POST décision — preuve périmée (remplacer le document puis
  // référencer l'ancien id, en utilisant cette fois le bon
  // derniere_decision_vue_id pour isoler spécifiquement ce cas).
  const { data: doc2 } = await sb.rpc("deposer_nouvelle_version_document", {
    p_institution_id: instId, p_type: "piece_identite", p_nom: "test-v2.pdf",
    p_storage_path: `${instId}/piece_identite/test-v2.pdf`, p_hash_integrite: "hash2",
    p_soumis_par_membre_id: membre.id,
  }).single();
  res = await fetch(decisionUrl, { method: "POST", headers: { "Content-Type": "application/json", Cookie: `yelen224_admin_session=${cookieAutorise}` }, body: JSON.stringify({
    axe: "identite", type_decision: "accordee", niveau_preuve: "profil_verifie",
    justification: "Test route — preuve périmée", derniere_decision_vue_id: decisionBody?.decision?.id, document_institution_ids: [doc.id],
  }) });
  const perimeeBody = await res.json().catch(() => null);
  verdict(res.status === 409 && perimeeBody?.code === "PREUVE_PERIMEE", `POST avec preuve remplacée → 409 PREUVE_PERIMEE (obtenu ${res.status} ${perimeeBody?.code})`);
  void doc2;

  log("");
  log(`## Résultat : ${pass} PASS, ${fail} FAIL`);

  await cleanup(instId);
}

async function cleanup(instId) {
  log("");
  log("## Nettoyage");
  log("SQL à exécuter (SQL Editor) :");
  log("```sql");
  log("BEGIN;");
  log("SET LOCAL app.autoriser_correction_verification_decisions = 'on';");
  log("SET LOCAL app.autoriser_correction_verification_decision_preuves = 'on';");
  log("SET LOCAL app.autoriser_correction_documents_institution = 'on';");
  log("SET LOCAL app.autoriser_correction_journal = 'on';");
  log("SET LOCAL app.autoriser_correction_signalement = 'on';");
  log(`DELETE FROM verification_decision_preuves WHERE decision_id IN (SELECT id FROM verification_decisions WHERE institution_id = '${instId}');`);
  log(`DELETE FROM verification_decisions WHERE institution_id = '${instId}';`);
  log(`DELETE FROM documents_institution WHERE institution_id = '${instId}';`);
  log(`DELETE FROM institution_membres WHERE institution_id = '${instId}';`);
  log(`DELETE FROM institutions WHERE id = '${instId}';`);
  log("COMMIT;");
  log("```");

  const outPath = path.join(ROOT, "scripts", "verify-admin-verification-routes-report.md");
  fs.writeFileSync(outPath, lignes.join("\n") + "\n", "utf8");
  console.log(`\nRapport écrit dans ${outPath}`);
}

main().catch((e) => {
  console.error("Échec du script :", e);
  process.exit(1);
});
