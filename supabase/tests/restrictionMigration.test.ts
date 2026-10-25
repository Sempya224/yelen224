import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Garde-fous statiques des migrations 20261020000003 (restriction d'accès) et
// 20261020000004 (« suspendue » reste protégé), Lot 3. Aucune base n'est
// interrogée : ces tests lisent le texte SQL. Les comportements réels (suspension
// atomique, événement lié, droits) sont vérifiés par
// supabase/tests/restriction_scenarios.sql, exécuté par Bryan.

const lire = (nom: string) => readFileSync(path.resolve(process.cwd(), "supabase/migrations", nom), "utf8").replace(/\r\n/g, "\n");
const sansCommentaires = (sql: string) => sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");

const RESTRICTION = sansCommentaires(lire("20261020000003_restriction_acces_changement_profil.sql"));
const PROTEGE = lire("20261020000004_appliquer_suspendue_protege.sql");
const PUBLICATION = lire("20261020000001_publication_differee_changements_profil.sql");

function fonctionAppliquer(sql: string): string {
  const debut = sql.indexOf("CREATE OR REPLACE FUNCTION public.appliquer_modifications_sensibles(");
  const marqueur = "GRANT EXECUTE ON FUNCTION public.appliquer_modifications_sensibles(uuid,uuid,uuid,jsonb,text,text,text,integer) TO service_role;";
  return sql.slice(debut, sql.indexOf(marqueur, debut) + marqueur.length);
}

describe("migration restriction d'accès", () => {
  it("le journal accepte l'événement acces_restreint, avec motif et référence de suspension obligatoires", () => {
    expect(RESTRICTION).toMatch(/CHECK \(type IN \('complement_demande', 'complement_fourni', 'acces_restreint'\)\)/);
    expect(RESTRICTION).toMatch(/ADD COLUMN IF NOT EXISTS suspension_reference text/);
    expect(RESTRICTION).toMatch(/type <> 'acces_restreint' OR \(message IS NOT NULL AND length\(btrim\(message\)\) > 0 AND suspension_reference IS NOT NULL\)/);
  });

  it("restreindre : SECURITY DEFINER, search_path fixé, réservée à service_role", () => {
    expect(RESTRICTION).toMatch(/FUNCTION public\.restreindre_acces_changement_profil[\s\S]*?SECURITY DEFINER\s+SET search_path = public/);
    expect(RESTRICTION).toMatch(/REVOKE ALL ON FUNCTION public\.restreindre_acces_changement_profil\(uuid,uuid,text,integer\) FROM PUBLIC, anon, authenticated/);
    expect(RESTRICTION).toMatch(/GRANT EXECUTE ON FUNCTION public\.restreindre_acces_changement_profil\(uuid,uuid,text,integer\) TO service_role;/);
  });

  it("restreindre : la seule écriture dans institutions est le passage à « suspendue » (jamais nom, badge, plan, confiance…)", () => {
    const corps = RESTRICTION.slice(RESTRICTION.indexOf("FUNCTION public.restreindre_acces_changement_profil"), RESTRICTION.indexOf("REVOKE ALL ON FUNCTION public.restreindre_acces_changement_profil"));
    const updates = [...corps.matchAll(/UPDATE public\.institutions SET ([^;]*?) WHERE/g)].map(m => m[1].trim());
    expect(updates).toEqual(["statut = 'suspendue'"]);
    expect(corps).not.toMatch(/DELETE FROM/);
  });

  it("restreindre : une demande ouverte et un établissement actuellement public (validee) sont exigés, sous verrous", () => {
    const corps = RESTRICTION.slice(RESTRICTION.indexOf("FUNCTION public.restreindre_acces_changement_profil"));
    expect(corps).toMatch(/v_demande\.statut <> 'a_examiner'/);
    expect(corps).toMatch(/v_inst\.statut::text <> 'validee'/);
    expect(corps.match(/pg_advisory_xact_lock/g)?.length).toBeGreaterThanOrEqual(2);
    expect(corps).toMatch(/hashtext\('changement_profil_decision:'/);
    expect(corps).toMatch(/hashtext\('institution_profil:'/);
  });

  it("restreindre : réutilise la suspension existante (ligne institution_suspensions) avec durée bornée 1 à 365 jours", () => {
    expect(RESTRICTION).toMatch(/INSERT INTO public\.institution_suspensions \(id, institution_id, motif, duree_jours, jusqu_au, admin_id\)/);
    expect(RESTRICTION).toMatch(/p_duree_jours < 1 OR p_duree_jours > 365/);
  });

  it("restreindre : événement du journal, trace admin et administrateur actif dans la même fonction", () => {
    expect(RESTRICTION).toMatch(/INSERT INTO public\.institution_change_request_events \(request_id, institution_id, type, acteur_type, acteur_id, acteur_nom, message, suspension_reference\)/);
    expect(RESTRICTION).toMatch(/'RESTREINDRE_ACCES_CHANGEMENT_PROFIL'/);
    expect(RESTRICTION).toMatch(/a\.id = p_admin_id AND a\.is_active/);
  });

  it("repondre : seuls les événements de complément comptent pour savoir si une réponse est attendue", () => {
    expect(RESTRICTION).toMatch(/e\.request_id = p_demande_id AND e\.type IN \('complement_demande', 'complement_fourni'\)/);
  });

  it("chaînes en ASCII (l'éditeur SQL tronque les collages accentués)", () => {
    expect(RESTRICTION).toMatch(/^[\x00-\x7F]*$/);
  });
});

describe("migration « suspendue reste protégé »", () => {
  it("est IDENTIQUE à la fonction de 20261020000001 à l'exception de la seule ligne v_publique", () => {
    const attendue = fonctionAppliquer(PUBLICATION).replace(
      "v_publique := v_inst.statut::text = 'validee';",
      "v_publique := v_inst.statut::text IN ('validee', 'suspendue');"
    );
    expect(fonctionAppliquer(PROTEGE)).toBe(attendue);
  });

  it("un établissement suspendu n'applique plus directement ses changements sensibles", () => {
    expect(PROTEGE).toMatch(/v_publique := v_inst\.statut::text IN \('validee', 'suspendue'\);/);
    expect(PROTEGE).not.toMatch(/v_publique := v_inst\.statut::text = 'validee';/);
  });

  it("reste exécutable par service_role seul", () => {
    expect(PROTEGE).toMatch(/REVOKE ALL ON FUNCTION public\.appliquer_modifications_sensibles\([^)]*\) FROM PUBLIC, anon, authenticated/);
    const grants = sansCommentaires(PROTEGE).split("\n").filter(l => /^\s*GRANT\b/i.test(l));
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatch(/TO service_role;\s*$/);
  });

  it("chaînes en ASCII", () => {
    expect(sansCommentaires(PROTEGE)).toMatch(/^[\x00-\x7F]*$/);
  });
});
