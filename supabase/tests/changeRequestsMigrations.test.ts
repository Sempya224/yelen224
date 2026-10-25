import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// Garde-fous statiques sur les migrations de revérification des changements
// sensibles (20261019000001/2). Aucune base n'est interrogée : ces tests lisent
// le texte SQL et échouent si quelqu'un élargit le périmètre d'écriture de la
// fonction (statut, badge, plan…), rouvre un droit à anon/authenticated ou
// réintroduit une clé étrangère qui bloquerait l'immuabilité. Les vrais
// comportements (rollback, concurrence, rôles) sont vérifiés par
// supabase/tests/institution_change_requests_scenarios.sql, exécuté par Bryan.

const lire = (nom: string) => readFileSync(path.resolve(process.cwd(), "supabase/migrations", nom), "utf8");
const sansCommentaires = (sql: string) => sql.split("\n").filter(l => !l.trim().startsWith("--")).join("\n");

const TABLE = lire("20261019000001_institution_change_requests.sql");
const FONCTION = lire("20261019000002_appliquer_modifications_sensibles.sql");
const TABLE_CODE = sansCommentaires(TABLE);
const FONCTION_CODE = sansCommentaires(FONCTION);

const COLONNES_ECRITES_INSTITUTIONS = ["activite_categorie_id", "adresse", "latitude", "longitude", "name", "slug", "ville"];
const CLES_CHAMPS_AUTORISEES = [
  "activite_categorie_id", "activite_principale_id", "activites_secondaires_ids",
  "adresse", "latitude", "longitude", "name", "ville",
];
const COLONNES_INTERDITES = ["statut", "badge_verifie", "niveau_confiance", "statut_juridique", "plan", "pin_hash", "mot_de_passe_hash", "email", "phone"];

describe("migration institution_change_requests", () => {
  it("active la RLS sans aucune policy et retire les droits à anon/authenticated", () => {
    expect(TABLE_CODE).toMatch(/ALTER TABLE institution_change_requests ENABLE ROW LEVEL SECURITY/);
    expect(TABLE_CODE).not.toMatch(/CREATE POLICY/i);
    expect(TABLE_CODE).toMatch(/REVOKE ALL ON institution_change_requests FROM anon, authenticated/);
  });

  it("retire à service_role l'écriture directe et TRUNCATE (qui contourne le trigger ligne)", () => {
    expect(TABLE_CODE).toMatch(/REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON institution_change_requests FROM service_role/);
  });

  it("bloque UPDATE/DELETE par trigger et garde l'échappatoire documentée", () => {
    expect(TABLE_CODE).toMatch(/BEFORE UPDATE OR DELETE ON institution_change_requests/);
    expect(TABLE_CODE).toMatch(/app\.autoriser_correction_changement/);
  });

  it("n'utilise ni CASCADE ni SET NULL (incompatibles avec l'immuabilité)", () => {
    expect(TABLE_CODE).not.toMatch(/ON DELETE (CASCADE|SET NULL)/i);
    expect(TABLE_CODE).toMatch(/REFERENCES institutions\(id\) ON DELETE RESTRICT/);
  });

  it("porte l'index anti-doublon ouvert et la contrainte a_corriger commenté", () => {
    expect(TABLE_CODE).toMatch(/CREATE UNIQUE INDEX icr_pas_de_doublon_ouvert/);
    expect(TABLE_CODE).toMatch(/WHERE statut = 'a_examiner'/);
    expect(TABLE_CODE).toMatch(/icr_a_corriger_commente/);
  });

  it("ne stocke aucun secret de réauthentification", () => {
    const colonnes = TABLE_CODE.slice(TABLE_CODE.indexOf("CREATE TABLE"), TABLE_CODE.indexOf("CREATE INDEX"));
    expect(colonnes).not.toMatch(/\b(pin|password|mot_de_passe|secret|token|totp)\w*\s+(text|uuid|jsonb)/i);
  });
});

describe("fonction appliquer_modifications_sensibles", () => {
  it("est SECURITY DEFINER avec search_path fixé", () => {
    expect(FONCTION_CODE).toMatch(/SECURITY DEFINER\s+SET search_path = public/);
  });

  it("n'est exécutable que par service_role", () => {
    const grants = FONCTION_CODE.split("\n").filter(l => /^\s*GRANT\b/i.test(l));
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) expect(g).toMatch(/TO service_role;\s*$/);
    expect(FONCTION_CODE).toMatch(/REVOKE ALL ON FUNCTION public\.appliquer_modifications_sensibles\([^)]*\) FROM PUBLIC, anon, authenticated/);
    expect(FONCTION_CODE).toMatch(/REVOKE ALL ON FUNCTION public\.normaliser_texte_profil\(text\) FROM PUBLIC, anon, authenticated/);
  });

  it("n'écrit que les colonnes d'institutions prévues (jamais statut, badge, plan…)", () => {
    const debut = FONCTION_CODE.indexOf("UPDATE public.institutions SET");
    const fin = FONCTION_CODE.indexOf("WHERE id = p_institution_id", debut);
    expect(debut).toBeGreaterThan(-1);
    const colonnes = [...FONCTION_CODE.slice(debut, fin).matchAll(/^\s*(\w+)\s*=/gm)].map(m => m[1]).sort();
    expect(colonnes).toEqual(COLONNES_ECRITES_INSTITUTIONS);
    expect(FONCTION_CODE.match(/UPDATE public\.institutions/g)?.length).toBe(1);
  });

  it("ne lit que les clés de p_champs prévues", () => {
    const cles = new Set([
      ...[...FONCTION_CODE.matchAll(/p_champs\s*\?\s*'(\w+)'/g)].map(m => m[1]),
      ...[...FONCTION_CODE.matchAll(/p_champs->>?\s*'(\w+)'/g)].map(m => m[1]),
    ]);
    expect([...cles].sort()).toEqual(CLES_CHAMPS_AUTORISEES);
  });

  it("ne mentionne jamais une colonne de statut/identifiants dans son code exécutable", () => {
    // `r.statut` désigne la colonne de la table des demandes (anti-doublon),
    // pas celle de l'établissement : seule exception tolérée.
    const code = FONCTION_CODE.replace(/\br\.statut\b/g, "");
    for (const col of COLONNES_INTERDITES) {
      expect(code, `colonne interdite référencée : ${col}`).not.toMatch(new RegExp(`\\b${col}\\b`));
    }
  });

  it("revérifie la réauthentification en base avec le code dédié YR001", () => {
    expect(FONCTION_CODE).toMatch(/reauth_at/);
    expect(FONCTION_CODE).toMatch(/revoked_at IS NULL/);
    expect(FONCTION_CODE).toMatch(/expires_at IS NOT NULL\s+AND expires_at >= now\(\)/);
    expect(FONCTION_CODE).toMatch(/ERRCODE = 'YR001'/);
  });

  it("verrouille l'institution avant de calculer le diff (anti-concurrence)", () => {
    const iVerrou = FONCTION_CODE.indexOf("pg_advisory_xact_lock");
    const iLecture = FONCTION_CODE.indexOf("FOR UPDATE");
    const iDiff = FONCTION_CODE.indexOf("v_sens_name :=");
    expect(iVerrou).toBeGreaterThan(-1);
    expect(iVerrou).toBeLessThan(iLecture);
    expect(iLecture).toBeLessThan(iDiff);
  });
});

const DECISION = lire("20261019000003_decider_changement_profil.sql");
const DECISION_CODE = sansCommentaires(DECISION);

describe("fonction decider_changement_profil", () => {
  it("est SECURITY DEFINER avec search_path fixé et réservée à service_role", () => {
    expect(DECISION_CODE).toMatch(/SECURITY DEFINER\s+SET search_path = public/);
    const grants = DECISION_CODE.split("\n").filter(l => /^\s*GRANT\b/i.test(l));
    expect(grants.length).toBeGreaterThan(0);
    for (const g of grants) expect(g).toMatch(/TO service_role;\s*$/);
    expect(DECISION_CODE).toMatch(/REVOKE ALL ON FUNCTION public\.decider_changement_profil\([^)]*\) FROM PUBLIC, anon, authenticated/);
  });

  it("ne touche jamais à la table institutions (aucun effet sur profil, statut, badge)", () => {
    // Le COMMENT ON FUNCTION cite la table dans sa documentation : on l'écarte.
    const sansComment = DECISION_CODE.replace(/COMMENT ON FUNCTION[\s\S]*?';/, "");
    expect(sansComment).not.toMatch(/\binstitutions\b/);
    // Une seule instruction UPDATE (le "FOR UPDATE" du SELECT verrouillant n'en est pas une).
    expect(DECISION_CODE.match(/^\s*UPDATE\b/gm)?.length).toBe(1);
    expect(DECISION_CODE).toMatch(/UPDATE public\.institution_change_requests SET/);
  });

  it("n'écrit que les colonnes de décision de la demande", () => {
    const debut = DECISION_CODE.indexOf("UPDATE public.institution_change_requests SET");
    const fin = DECISION_CODE.indexOf("WHERE id = p_demande_id", debut);
    const colonnes = [...DECISION_CODE.slice(debut, fin).matchAll(/^\s*(\w+)\s*=/gm)].map(m => m[1]).sort();
    expect(colonnes).toEqual(["commentaire_admin", "decide_le", "decide_par_admin_id", "decide_par_nom", "decision", "statut"]);
  });

  it("verrouille, vérifie le statut vu et trace admin_logs dans la même fonction", () => {
    expect(DECISION_CODE.indexOf("pg_advisory_xact_lock")).toBeLessThan(DECISION_CODE.indexOf("FOR UPDATE"));
    expect(DECISION_CODE).toMatch(/p_statut_vu IS DISTINCT FROM v_demande\.statut/);
    expect(DECISION_CODE).toMatch(/INSERT INTO public\.admin_logs/);
    expect(DECISION_CODE).toMatch(/is_active/);
  });

  it("exige un commentaire pour a_corriger et ne stocke jamais d'identifiant d'acteur venant du client", () => {
    expect(DECISION_CODE).toMatch(/p_decision = 'a_corriger' AND v_commentaire IS NULL/);
    expect(DECISION_CODE).not.toMatch(/p_examinateur_nom/);
  });
});

describe("ordre des migrations", () => {
  it("crée la table avant la fonction qui l'utilise", () => {
    expect("20261019000001_institution_change_requests.sql" < "20261019000002_appliquer_modifications_sensibles.sql").toBe(true);
    expect(TABLE_CODE).toMatch(/CREATE TABLE institution_change_requests/);
    expect(FONCTION_CODE).toMatch(/public\.institution_change_requests/);
  });
});

// ── Migration 20261020000001 : publication différée ─────────────────────────
// Remplace les fonctions des migrations 20261019000002 et 20261019000003 (dont
// les garde-fous ci-dessus décrivent l'ancien comportement « publié tout de
// suite »). Nouvelle règle : institutions.* = valeurs publiées ; un changement
// sensible reste une proposition tant qu'un admin n'a pas décidé.
const PUBLICATION = lire("20261020000001_publication_differee_changements_profil.sql");
const PUBLICATION_CODE = sansCommentaires(PUBLICATION);
const COLONNES_PUBLIABLES = ["activite_categorie_id", "adresse", "latitude", "longitude", "name", "slug", "ville"];

function colonnesMisesAJour(code: string): string[] {
  const colonnes = new Set<string>();
  for (const bloc of code.matchAll(/UPDATE public\.institutions SET([\s\S]*?)WHERE/g)) {
    for (const m of bloc[1].matchAll(/\b(\w+)\s*=/g)) colonnes.add(m[1]);
  }
  return [...colonnes].sort();
}

describe("migration publication différée", () => {
  it("ajoute l'état retiree et une seule proposition ouverte par champ", () => {
    expect(PUBLICATION_CODE).toMatch(/CHECK \(statut IN \('a_examiner', 'examinee', 'retiree'\)\)/);
    expect(PUBLICATION_CODE).toMatch(/CREATE UNIQUE INDEX icr_une_ouverte_par_champ[\s\S]*?\(institution_id, champ\) WHERE statut = 'a_examiner'/);
    expect(PUBLICATION_CODE).toMatch(/DROP INDEX IF EXISTS public\.icr_pas_de_doublon_ouvert/);
  });

  it("une proposition retirée n'a ni décision ni acteur (seulement une date)", () => {
    expect(PUBLICATION_CODE).toMatch(/statut = 'retiree' AND decision IS NULL AND decide_par_nom IS NULL AND decide_le IS NOT NULL/);
  });

  it("n'écrit dans institutions que les colonnes publiables — jamais statut, badge, plan, confiance, statut juridique", () => {
    expect(colonnesMisesAJour(PUBLICATION_CODE)).toEqual(COLONNES_PUBLIABLES);
    for (const interdit of ["badge_verifie", "niveau_confiance", "statut_juridique", "plan", "pin_hash", "email", "phone"]) {
      expect(PUBLICATION_CODE, "colonne interdite référencée : " + interdit).not.toMatch(new RegExp("\\b" + interdit + "\\b"));
    }
    expect(PUBLICATION_CODE).not.toMatch(/UPDATE public\.institutions SET[^;]*\bstatut\b\s*=/);
  });

  it("appliquer : ne publie que pour un établissement non public (validee = proposition seulement)", () => {
    expect(PUBLICATION_CODE).toMatch(/v_publique := v_inst\.statut::text = 'validee'/);
    expect(PUBLICATION_CODE).toMatch(/v_dir_name := v_chg_name AND NOT v_ret_name AND NOT v_publique/);
    expect(PUBLICATION_CODE).toMatch(/v_prop_name := v_chg_name AND NOT v_ret_name AND v_publique/);
    // le bloc UPDATE institutions de appliquer ne dépend que des variables "dir" (directes) et "cos" (casse)
    const bloc = PUBLICATION_CODE.match(/IF v_dir_name OR v_cos_name[\s\S]*?WHERE id = p_institution_id;/)?.[0] ?? "";
    expect(bloc).not.toMatch(/v_prop_|v_chg_/);
  });

  it("appliquer : réauthentification revérifiée en base (session valide, non expirée) et code YR001", () => {
    expect(PUBLICATION_CODE).toMatch(/s\.revoked_at IS NULL AND s\.expires_at IS NOT NULL AND s\.expires_at >= now\(\)/);
    expect(PUBLICATION_CODE).toMatch(/ERRCODE = 'YR001'/);
  });

  it("appliquer et decider : verrou consultatif, SECURITY DEFINER, search_path fixé, service_role seul", () => {
    expect(PUBLICATION_CODE.match(/SECURITY DEFINER\s+SET search_path = public/g)?.length).toBe(2);
    expect(PUBLICATION_CODE.match(/pg_advisory_xact_lock/g)?.length).toBe(2);
    const grants = PUBLICATION_CODE.split("\n").filter(l => /^\s*GRANT\b/i.test(l));
    expect(grants).toHaveLength(2);
    for (const g of grants) expect(g).toMatch(/TO service_role;\s*$/);
    expect(PUBLICATION_CODE).toMatch(/REVOKE ALL ON FUNCTION public\.decider_changement_profil\(uuid,text,text,uuid,text,text\) FROM PUBLIC, anon, authenticated/);
    expect(PUBLICATION_CODE).toMatch(/REVOKE ALL ON FUNCTION public\.appliquer_modifications_sensibles\([^)]*\) FROM PUBLIC, anon, authenticated/);
  });

  it("decider : ne publie qu'à l'approbation (conforme), dans la même transaction que la décision et admin_logs", () => {
    const corps = PUBLICATION_CODE.slice(PUBLICATION_CODE.indexOf("CREATE OR REPLACE FUNCTION public.decider_changement_profil"));
    const iDecision = corps.indexOf("UPDATE public.institution_change_requests SET");
    const iPublication = corps.indexOf("IF p_decision = 'conforme' THEN");
    const iLog = corps.indexOf("INSERT INTO public.admin_logs");
    expect(iDecision).toBeGreaterThan(-1);
    expect(iDecision).toBeLessThan(iPublication);
    expect(iPublication).toBeLessThan(iLog);
    const avantPublication = corps.slice(0, iPublication);
    expect(avantPublication).not.toMatch(/UPDATE public\.institutions/);
    expect(corps).toMatch(/p_statut_vu IS DISTINCT FROM v_demande\.statut/);
    expect(corps).toMatch(/p_decision = 'a_corriger' AND v_commentaire IS NULL/);
  });

  it("decider : l'ancienne signature à 5 paramètres est retirée, la nouvelle en a 6 (slug)", () => {
    expect(PUBLICATION_CODE).toMatch(/DROP FUNCTION IF EXISTS public\.decider_changement_profil\(uuid, text, text, uuid, text\)/);
    expect(PUBLICATION_CODE).toMatch(/p_statut_vu\s+text,\s+p_slug\s+text/);
  });

  it("messages d'erreur et chaînes de la migration en ASCII (l'éditeur SQL tronque les collages accentués)", () => {
    expect(PUBLICATION_CODE).toMatch(/^[\x00-\x7F]*$/);
  });
});
