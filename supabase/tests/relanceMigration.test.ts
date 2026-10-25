import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PALIERS_RELANCE_JOURS } from "@/lib/changementsProfilAffichage";

// Garde-fous statiques de la migration 20261020000005 (relance automatique des
// propositions anciennes). Aucune base n'est interrogée : ces tests lisent le texte
// SQL. Le comportement réel est vérifié par supabase/tests/relance_scenarios.sql,
// exécuté par Bryan.

const lire = (nom: string) => readFileSync(path.resolve(process.cwd(), "supabase/migrations", nom), "utf8").replace(/\r\n/g, "\n");
const sansCommentaires = (sql: string) => sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");
const SQL = sansCommentaires(lire("20261020000005_relance_propositions_anciennes.sql"));

describe("migration relance automatique", () => {
  it("étend le journal : type relance_envoyee et acteur systeme, sans perdre les valeurs existantes", () => {
    expect(SQL).toMatch(/CHECK \(type IN \('complement_demande', 'complement_fourni', 'acces_restreint', 'relance_envoyee'\)\)/);
    expect(SQL).toMatch(/CHECK \(acteur_type IN \('admin', 'membre', 'systeme'\)\)/);
  });

  it("les contraintes sont retirées avant d'être recréées (ordre DROP puis ADD)", () => {
    expect(SQL.indexOf("DROP CONSTRAINT IF EXISTS institution_change_request_events_type_check")).toBeLessThan(SQL.indexOf("ADD CONSTRAINT institution_change_request_events_type_check"));
  });

  it("les seuils SQL (7 et 14 jours) sont ceux de lib/changementsProfilAffichage", () => {
    expect(PALIERS_RELANCE_JOURS).toEqual([7, 14]);
    expect(SQL).toMatch(/v_jours >= 14 THEN 14 WHEN v_jours >= 7 THEN 7/);
  });

  it("ne cible que les propositions a_examiner d'établissements validés", () => {
    expect(SQL).toMatch(/q\.statut = 'a_examiner' AND i\.statut::text = 'validee'/);
  });

  it("ne publie jamais : aucune écriture sur institutions ni sur les demandes", () => {
    expect(SQL).not.toMatch(/UPDATE\s+public\.institutions/i);
    expect(SQL).not.toMatch(/UPDATE\s+public\.institution_change_requests/i);
    expect(SQL).not.toMatch(/decider_changement_profil/);
  });

  it("dédoublonne par palier et période d'activité, sous verrou advisory", () => {
    expect(SQL).toMatch(/e\.type = 'relance_envoyee' AND e\.message = v_marqueur AND e\.created_at >= v_activite/);
    expect(SQL).toMatch(/pg_advisory_xact_lock/);
  });

  it("l'activité ignore les relances elles-mêmes (sinon une relance redémarrerait l'horloge)", () => {
    expect(SQL).toMatch(/e\.type IN \('complement_demande', 'complement_fourni'\)\)/);
  });

  it("fonction SECURITY DEFINER à search_path fixé, exécutable par service_role seul", () => {
    expect(SQL).toMatch(/SECURITY DEFINER\nSET search_path = public/);
    expect(SQL).toMatch(/REVOKE ALL ON FUNCTION public\.relancer_propositions_anciennes\(\) FROM PUBLIC, anon, authenticated;/);
    expect(SQL).toMatch(/GRANT EXECUTE ON FUNCTION public\.relancer_propositions_anciennes\(\) TO service_role;/);
  });

  it("planifie un job quotidien nommé", () => {
    expect(SQL).toMatch(/cron\.schedule\('yelen-relance-propositions', '0 8 \* \* \*'/);
  });

  it("migration en ASCII pur (l'éditeur SQL tronque les accents)", () => {
    expect(/^[\x00-\x7F]*$/.test(lire("20261020000005_relance_propositions_anciennes.sql"))).toBe(true);
  });
});
