import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Garde-fous statiques de la migration 20261020000002 (compléments répétables,
// Lot 2). Aucune base n'est interrogée : ces tests lisent le texte SQL. Les
// comportements réels (immuabilité, atomicité, état de la demande) sont vérifiés
// par supabase/tests/complements_scenarios.sql, exécuté par Bryan.

const SQL = readFileSync(path.resolve(process.cwd(), "supabase/migrations/20261020000002_complements_changement_profil.sql"), "utf8");
const CODE = SQL.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");

describe("migration compléments répétables", () => {
  it("journal d'échanges : RLS sans policy, droits retirés à anon/authenticated, service_role en lecture seule", () => {
    expect(CODE).toMatch(/ALTER TABLE public\.institution_change_request_events ENABLE ROW LEVEL SECURITY/);
    expect(CODE).not.toMatch(/CREATE POLICY/i);
    expect(CODE).toMatch(/REVOKE ALL ON public\.institution_change_request_events FROM anon, authenticated/);
    expect(CODE).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public\.institution_change_request_events FROM service_role/);
  });

  it("journal immuable : UPDATE et DELETE bloqués par trigger, échappatoire documentée", () => {
    expect(CODE).toMatch(/BEFORE UPDATE OR DELETE ON public\.institution_change_request_events/);
    expect(CODE).toMatch(/app\.autoriser_correction_changement/);
  });

  it("clés étrangères en RESTRICT (jamais CASCADE ni SET NULL, incompatibles avec l'immuabilité)", () => {
    expect(CODE).not.toMatch(/ON DELETE (CASCADE|SET NULL)/i);
    expect(CODE.match(/ON DELETE RESTRICT/g)?.length).toBe(2);
  });

  it("motif obligatoire pour demander un complément, messages et pièces bornés", () => {
    expect(CODE).toMatch(/type <> 'complement_demande' OR \(message IS NOT NULL AND length\(btrim\(message\)\) > 0\)/);
    expect(CODE).toMatch(/length\(message\) <= 1000/);
    expect(CODE).toMatch(/cardinality\(types_documents\) <= 6/);
  });

  it("ne stocke aucun secret et seulement deux types d'événements", () => {
    expect(CODE).toMatch(/CHECK \(type IN \('complement_demande', 'complement_fourni'\)\)/);
    expect(CODE).not.toMatch(/\b(pin|password|mot_de_passe|secret|token|totp)\w*\s+(text|uuid|jsonb)/i);
  });

  it("deux fonctions SECURITY DEFINER, search_path fixé, réservées à service_role", () => {
    expect(CODE.match(/SECURITY DEFINER\s+SET search_path = public/g)?.length).toBe(2);
    const grants = CODE.split("\n").filter(l => /^\s*GRANT\b/i.test(l));
    expect(grants).toHaveLength(2);
    for (const g of grants) expect(g).toMatch(/TO service_role;\s*$/);
    expect(CODE).toMatch(/REVOKE ALL ON FUNCTION public\.demander_complement_changement_profil\(uuid,uuid,text,text\[\]\) FROM PUBLIC, anon, authenticated/);
    expect(CODE).toMatch(/REVOKE ALL ON FUNCTION public\.repondre_complement_changement_profil\(uuid,uuid,uuid,text\) FROM PUBLIC, anon, authenticated/);
  });

  it("ne modifie jamais la proposition, ni institutions : seulement INSERT dans le journal et admin_logs", () => {
    expect(CODE).not.toMatch(/UPDATE public\./);
    expect(CODE).not.toMatch(/DELETE FROM public\./);
    const inserts = [...CODE.matchAll(/INSERT INTO (public\.\w+)/g)].map(m => m[1]).sort();
    expect(inserts).toEqual(["public.admin_logs", "public.institution_change_request_events", "public.institution_change_request_events"]);
  });

  it("verrouille avec la même clé que la décision (aucune course entre complément et décision) et exige une demande ouverte", () => {
    expect(CODE.match(/pg_advisory_xact_lock\(hashtext\('changement_profil_decision:'/g)?.length).toBe(2);
    expect(CODE.match(/v_demande\.statut <> 'a_examiner'/g)?.length).toBe(2);
  });

  it("répondre : institution issue des paramètres de session, demande de CET établissement, complément réellement attendu", () => {
    const corps = CODE.slice(CODE.indexOf("FUNCTION public.repondre_complement_changement_profil"));
    expect(corps).toMatch(/r\.id = p_demande_id AND r\.institution_id = p_institution_id FOR UPDATE/);
    expect(corps).toMatch(/m\.id = p_membre_id AND m\.institution_id = p_institution_id/);
    expect(corps).toMatch(/v_dernier IS DISTINCT FROM 'complement_demande'/);
  });

  it("demander : administrateur actif, nom dérivé en base, trace admin_logs dans la même fonction", () => {
    const corps = CODE.slice(CODE.indexOf("FUNCTION public.demander_complement_changement_profil"), CODE.indexOf("FUNCTION public.repondre_complement_changement_profil"));
    expect(corps).toMatch(/a\.id = p_admin_id AND a\.is_active/);
    expect(corps).toMatch(/INSERT INTO public\.admin_logs/);
    expect(corps).toMatch(/'COMPLEMENT_CHANGEMENT_PROFIL'/);
  });

  it("chaînes de la migration en ASCII (l'éditeur SQL tronque les collages accentués)", () => {
    expect(CODE).toMatch(/^[\x00-\x7F]*$/);
  });

  it("ordre : postérieure à la migration de publication différée, dont elle dépend", () => {
    expect("20261020000001_publication_differee_changements_profil.sql" < "20261020000002_complements_changement_profil.sql").toBe(true);
    expect(CODE).toMatch(/public\.institution_change_requests/);
  });
});
