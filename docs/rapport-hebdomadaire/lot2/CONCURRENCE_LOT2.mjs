// Tests de CONCURRENCE du Lot 2 — PROPOSITION, non exécuté.
// À lancer par Bryan APRÈS application de la migration, depuis la racine du
// dépôt, avec les variables du serveur (jamais commitées) :
//   $env:NEXT_PUBLIC_SUPABASE_URL="https://pgcabxgrgjgukuagpuhc.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="<clé service_role>"
//   node docs/rapport-hebdomadaire/lot2/CONCURRENCE_LOT2.mjs
//
// Pourquoi un script et pas l'éditeur SQL : l'éditeur Supabase passe par un
// pool de connexions, deux onglets ne garantissent pas deux sessions réelles
// concurrentes. Ici chaque appel RPC part en parallèle (Promise.all).
//
// ⚠️ ÉCRIT DANS LA BASE RÉELLE (semaine de TEST 2020-03-02, premier
// établissement). Les lignes ne peuvent pas être supprimées par service_role
// (immuabilité) : nettoyage manuel ensuite, voir la fin de ce fichier.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const cle = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !cle) { console.error("Variables NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquantes."); process.exit(2); }
const sb = createClient(url, cle, { auth: { persistSession: false } });

const SEMAINE = "2020-03-02";
const GENERE = "2020-03-10T06:00:00+00:00";
let echecs = 0;
const verifier = (nom, condition, detail) => {
  console.log(`${condition ? "OK   " : "ECHEC"} ${nom}${condition ? "" : ` -> ${detail}`}`);
  if (!condition) echecs += 1;
};
const rpc = async (nom, args) => {
  const { data, error } = await sb.rpc(nom, args);
  if (error) throw new Error(`${nom}: ${error.message}`);
  return data;
};

const { data: inst, error: errInst } = await sb.from("institutions").select("id").limit(1).maybeSingle();
if (errInst || !inst) { console.error("Aucun établissement lisible.", errInst?.message); process.exit(2); }
const enregistrer = (extra = {}) => rpc("institution_rapport_hebdo_enregistrer", {
  p_institution_id: inst.id, p_semaine_debut: SEMAINE, p_version_moteur: 1, p_vide: false,
  p_contenu: { test: "concurrence" }, p_genere_le: GENERE, ...extra,
});

// C1 — 10 créations simultanées de la même semaine : 1 'cree', 9 'deja_genere'.
const c1 = await Promise.all(Array.from({ length: 10 }, () => enregistrer()));
const r1 = c1.map((l) => l[0].out_resultat);
verifier("C1 une seule création", r1.filter((x) => x === "cree").length === 1 && r1.filter((x) => x === "deja_genere").length === 9, JSON.stringify(r1));

// C2 — 6 régénérations simultanées basées sur la version 1 : 1 'regenere', 5 'conflit'.
const c2 = await Promise.all(Array.from({ length: 6 }, (_, i) => enregistrer({
  p_regenerer: true, p_motif: `Régénération concurrente ${i}`, p_version_attendue: 1,
})));
const r2 = c2.map((l) => l[0].out_resultat);
verifier("C2 une seule régénération", r2.filter((x) => x === "regenere").length === 1 && r2.filter((x) => x === "conflit").length === 5, JSON.stringify(r2));

// C3 — état final : exactement 2 versions, 1 seul courant.
const { data: versions } = await sb.from("institution_rapports_hebdo").select("numero_version,est_courante").eq("institution_id", inst.id).eq("semaine_debut", SEMAINE);
verifier("C3 2 versions dont 1 courante", versions?.length === 2 && versions.filter((v) => v.est_courante).length === 1, JSON.stringify(versions));

// C4 — 10 réservations d'envoi simultanées : exactement une obtient true.
const rapportId = c1.map((l) => l[0]).find((l) => l.out_resultat === "cree").out_rapport_id;
const reserver = () => rpc("institution_rapport_hebdo_reserver_envoi", { p_institution_id: inst.id, p_semaine_debut: SEMAINE, p_canal: "notification", p_rapport_id: rapportId });
const c4 = await Promise.all(Array.from({ length: 10 }, reserver));
verifier("C4 un seul envoi réservé", c4.filter(Boolean).length === 1, JSON.stringify(c4));

// C5 — échec puis 10 reprises simultanées : exactement une reprise obtient true.
await rpc("institution_rapport_hebdo_terminer_envoi", { p_institution_id: inst.id, p_semaine_debut: SEMAINE, p_canal: "notification", p_ok: false, p_erreur: "échec simulé" });
const c5 = await Promise.all(Array.from({ length: 10 }, reserver));
verifier("C5 une seule reprise après échec", c5.filter(Boolean).length === 1, JSON.stringify(c5));

// C6 — créer et régénérer en même temps sur une semaine neuve : jamais deux courants.
const SEMAINE2 = "2020-03-09";
const enr2 = (extra) => rpc("institution_rapport_hebdo_enregistrer", {
  p_institution_id: inst.id, p_semaine_debut: SEMAINE2, p_version_moteur: 1, p_vide: false,
  p_contenu: { test: "c6" }, p_genere_le: "2020-03-17T06:00:00+00:00", ...extra,
});
await Promise.allSettled([
  enr2({}), enr2({}),
  enr2({ p_regenerer: true, p_motif: "Régénération simultanée C6", p_version_attendue: 1 }),
]);
const { data: v6 } = await sb.from("institution_rapports_hebdo").select("numero_version,est_courante").eq("institution_id", inst.id).eq("semaine_debut", SEMAINE2);
verifier("C6 jamais deux rapports courants", (v6 ?? []).filter((v) => v.est_courante).length === 1, JSON.stringify(v6));

console.log(echecs === 0 ? "\nTOUS LES SCÉNARIOS DE CONCURRENCE SONT PASSÉS" : `\n${echecs} SCÉNARIO(S) EN ÉCHEC`);
console.log(`Nettoyage manuel (SQL Editor) : voir le bas de ce fichier. Établissement utilisé : ${inst.id}`);
process.exit(echecs === 0 ? 0 : 1);

// Nettoyage (SQL Editor, rôle postgres) — supprime les semaines de test 2020-03 :
//   BEGIN;
//   SET LOCAL app.autoriser_correction_rapport_hebdo = 'on';
//   DELETE FROM institution_rapports_hebdo_envois     WHERE semaine_debut IN ('2020-03-02', '2020-03-09');
//   DELETE FROM institution_rapports_hebdo_executions WHERE semaine_debut IN ('2020-03-02', '2020-03-09');
//   DELETE FROM institution_rapports_hebdo            WHERE semaine_debut IN ('2020-03-02', '2020-03-09');
//   COMMIT;
