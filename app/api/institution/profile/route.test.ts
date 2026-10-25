import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────
// Politique de revérification (docs/product/YELEN_REVERIFICATION_POLICY.md,
// §8) — PUT /api/institution/profile : champs de niveau B (nom, ville,
// adresse, coordonnées, catégorie + activité principale) passent par la
// fonction SQL appliquer_modifications_sensibles après réauthentification ;
// niveau A inchangé. La base n'est pas interrogée ici : la fonction SQL est
// simulée (son comportement réel est vérifié par
// supabase/tests/institution_change_requests_scenarios.sql, exécuté par
// Bryan). Ces tests couvrent la route : authentification, rôle, validation,
// 403 REAUTH_REQUIRED avant toute écriture, attribution (institution /
// membre / session issus de la session, jamais du corps), mapping d'erreurs.
// ─────────────────────────────────────────────────────────────────────────

const h = vi.hoisted(() => ({
  getAuthenticatedMembre: vi.fn(),
  estReauthRecente: vi.fn(),
  enregistrerAction: vi.fn(async (_params: Record<string, unknown>) => {}),
}));
vi.mock("@/lib/institutionAuth", () => ({
  getAuthenticatedMembre: h.getAuthenticatedMembre,
  estReauthRecente: h.estReauthRecente,
  INSTITUTION_REAUTH_WINDOW_MS: 10 * 60 * 1000,
}));
vi.mock("@/lib/edgeSecurity", () => ({ extraireIpClient: () => "203.0.113.9" }));
vi.mock("@/lib/institutionSlug", () => ({ generateInstitutionSlug: vi.fn(async () => "nouveau-slug") }));
vi.mock("@/lib/journalActivite", () => ({
  enregistrerAction: h.enregistrerAction,
  getMembreNomPourJournal: vi.fn(async () => "Membre Test"),
}));

type Ligne = Record<string, unknown>;
type RpcReponse = { data: unknown; error: { code?: string; message?: string } | null };

const etat = {
  institution: {} as Ligne,
  activites: [] as Ligne[],
  propositions: [] as Ligne[],
  nbDocuments: 0,
  ordre: [] as string[],
  appelsRpc: [] as { nom: string; args: Ligne }[],
  majInstitutions: [] as Ligne[],
  rpcReponse: { data: { demandes: [], absorbees: [] }, error: null } as RpcReponse,
};

const fauxSupabase = {
  from(table: string) {
    if (table === "institutions") {
      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: etat.institution, error: null }) }) }),
        update: (patch: Ligne) => ({
          eq: async () => {
            etat.ordre.push("update_institutions");
            etat.majInstitutions.push(patch);
            return { error: null };
          },
        }),
      };
    }
    if (table === "institution_activites") {
      return { select: () => ({ eq: async () => ({ data: etat.activites, error: null }) }) };
    }
    if (table === "institution_change_requests") {
      return { select: () => ({ eq: () => ({ eq: async () => ({ data: etat.propositions, error: null }) }) }) };
    }
    if (table === "documents_institution") {
      return { select: () => ({ eq: async () => ({ count: etat.nbDocuments, error: null }) }) };
    }
    // Validation catégorie/activités de la route (existent toujours ici : seul
    // le comportement de la route autour de la fonction SQL est testé).
    if (table === "activite_categories") {
      return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "cat-2" }, error: null }) }) }) }) };
    }
    if (table === "activites") {
      return {
        select: () => ({
          in: (_c: string, ids: string[]) => ({ eq: () => ({ eq: async () => ({ data: ids.map(id => ({ id })), error: null }) }) }),
          eq: () => ({ maybeSingle: async () => ({ data: { code: "hotellerie" }, error: null }) }),
        }),
      };
    }
    throw new Error(`table non simulée: ${table}`);
  },
  async rpc(nom: string, args: Ligne) {
    etat.ordre.push("rpc");
    etat.appelsRpc.push({ nom, args });
    return etat.rpcReponse;
  },
};

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => fauxSupabase) }));

const INSTITUTION = "11111111-1111-1111-1111-111111111111";
const AUTRE_INSTITUTION = "22222222-2222-2222-2222-222222222222";
const MEMBRE = "33333333-3333-3333-3333-333333333333";
const SID = "44444444-4444-4444-4444-444444444444";

function membre(role = "admin") {
  return { institutionId: INSTITUTION, membreId: MEMBRE, role, sid: SID, reauthAt: null, accesRestreints: null };
}

function requete(body: unknown) {
  return new NextRequest("http://localhost/api/institution/profile", {
    method: "PUT",
    headers: { "content-type": "application/json", "user-agent": "vitest" },
    body: JSON.stringify(body),
  });
}

async function put(body: unknown) {
  const { PUT } = await import("./route");
  const res = await PUT(requete(body));
  return { status: res.status, json: await res.json() };
}

// Premier import de la route (transformation de tout le graphe de modules) : lent
// à froid, d'où un délai large ici plutôt que dans le premier test.
beforeAll(async () => { await import("./route"); }, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  h.getAuthenticatedMembre.mockResolvedValue(membre());
  h.estReauthRecente.mockReturnValue(false);
  etat.institution = {
    name: "Clinique Aurore", ville: "Conakry", adresse: "Rue 1", latitude: 9.5, longitude: -13.7,
    activite_categorie_id: null, statut_juridique: "prive_formel",
  };
  etat.activites = [];
  etat.propositions = [];
  etat.nbDocuments = 0;
  etat.ordre = [];
  etat.appelsRpc = [];
  etat.majInstitutions = [];
  etat.rpcReponse = { data: { demandes: [], absorbees: [] }, error: null };
});

describe("PUT /api/institution/profile — accès", () => {
  it("401 sans session, aucune écriture", async () => {
    h.getAuthenticatedMembre.mockResolvedValue(null);
    const { status } = await put({ name: "X" });
    expect(status).toBe(401);
    expect(etat.ordre).toEqual([]);
  });

  it("403 si le rôle n'a pas profil_entreprise.write, aucune écriture", async () => {
    h.getAuthenticatedMembre.mockResolvedValue(membre("comptable"));
    const { status } = await put({ name: "Autre nom" });
    expect(status).toBe(403);
    expect(etat.ordre).toEqual([]);
  });
});

describe("PUT /api/institution/profile — niveau A", () => {
  it("n'appelle jamais la fonction SQL ni n'exige de réauth pour un champ de niveau A", async () => {
    const { status, json } = await put({ description: "Nouvelle description" });
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true, demandes: [], appliques: [] });
    expect(etat.appelsRpc).toHaveLength(0);
    expect(h.estReauthRecente).not.toHaveBeenCalled();
    expect(etat.majInstitutions).toHaveLength(1);
    expect(etat.majInstitutions[0]).toMatchObject({ description: "Nouvelle description" });
  });

  it("quartier reste de niveau A (écrit directement, sans fonction SQL)", async () => {
    await put({ quartier: "Kaloum" });
    expect(etat.appelsRpc).toHaveLength(0);
    expect(etat.majInstitutions[0]).toMatchObject({ quartier: "Kaloum" });
  });

  it("aucun champ de niveau B n'est écrit directement dans institutions", async () => {
    h.estReauthRecente.mockReturnValue(true);
    await put({ name: "Clinique Zénith", ville: "Kindia", description: "d" });
    const ecrit = etat.majInstitutions[0];
    for (const cle of ["name", "ville", "adresse", "latitude", "longitude", "activite_categorie_id", "slug"]) {
      expect(ecrit).not.toHaveProperty(cle);
    }
  });
});

describe("PUT /api/institution/profile — niveau B", () => {
  it("changement sensible sans réauth récente → 403 REAUTH_REQUIRED, aucune écriture", async () => {
    const { status, json } = await put({ name: "Clinique Zénith", description: "d" });
    expect(status).toBe(403);
    expect(json.code).toBe("REAUTH_REQUIRED");
    expect(etat.appelsRpc).toHaveLength(0);
    expect(etat.majInstitutions).toHaveLength(0);
  });

  it("changement sensible avec réauth → fonction SQL avec institution/membre/session de la session", async () => {
    h.estReauthRecente.mockReturnValue(true);
    etat.rpcReponse = { data: { demandes: [{ id: "secret-id", numero: "YL-CHG-2026-00000001", champ: "name" }], absorbees: [] }, error: null };
    const { status, json } = await put({ name: "Clinique Zénith", ville: "Conakry" });
    expect(status).toBe(200);
    expect(json.demandes).toEqual([{ numero: "YL-CHG-2026-00000001", champ: "name" }]);
    expect(JSON.stringify(json)).not.toContain("secret-id");
    expect(etat.appelsRpc).toHaveLength(1);
    const { nom, args } = etat.appelsRpc[0];
    expect(nom).toBe("appliquer_modifications_sensibles");
    expect(args).toMatchObject({
      p_institution_id: INSTITUTION, p_membre_id: MEMBRE, p_session_id: SID,
      p_slug: "nouveau-slug", p_ip: "203.0.113.9", p_user_agent: "vitest", p_fenetre_reauth_secondes: 600,
    });
    expect(args.p_champs).toEqual({ name: "Clinique Zénith", ville: "Conakry" });
  });

  it("journalise une ligne par demande créée, avec valeurs avant/après et la demande pour cible", async () => {
    h.estReauthRecente.mockReturnValue(true);
    etat.rpcReponse = {
      data: { demandes: [{ id: "demande-1", numero: "YL-CHG-2026-00000001", champ: "name" }], absorbees: [] },
      error: null,
    };
    await put({ name: "Clinique Zénith" });
    expect(h.enregistrerAction).toHaveBeenCalledTimes(1);
    expect(h.enregistrerAction.mock.calls[0][0]).toMatchObject({
      institutionId: INSTITUTION, membreId: MEMBRE, membreNom: "Membre Test",
      action: "changement_profil_sensible", cibleTable: "institution_change_requests", cibleId: "demande-1",
      details: { champ: "name", numero: "YL-CHG-2026-00000001" },
      ancienneValeur: { name: "Clinique Aurore" }, nouvelleValeur: { name: "Clinique Zénith" },
    });
  });

  it("ne journalise rien quand aucune demande n'est créée (simple changement de casse, rejeu, niveau A)", async () => {
    h.estReauthRecente.mockReturnValue(true);
    await put({ name: "CLINIQUE AURORE" });
    await put({ description: "d" });
    expect(h.enregistrerAction).not.toHaveBeenCalled();
  });

  it("ne journalise pas quand la fonction SQL échoue", async () => {
    h.estReauthRecente.mockReturnValue(true);
    etat.rpcReponse = { data: null, error: { code: "23503", message: "fk" } };
    await put({ name: "Clinique Zénith" });
    expect(h.enregistrerAction).not.toHaveBeenCalled();
  });

  it("ignore tout institution_id fourni dans le corps (pas d'accès inter-établissements)", async () => {
    h.estReauthRecente.mockReturnValue(true);
    await put({ name: "Clinique Zénith", institution_id: AUTRE_INSTITUTION, membre_id: "x", p_session_id: "y" });
    const { args } = etat.appelsRpc[0];
    expect(args.p_institution_id).toBe(INSTITUTION);
    expect(args.p_membre_id).toBe(MEMBRE);
    expect(args.p_session_id).toBe(SID);
    expect(args.p_champs).not.toHaveProperty("institution_id");
  });

  it("aucun secret de réauthentification n'est transmis à la fonction SQL", async () => {
    h.estReauthRecente.mockReturnValue(true);
    await put({ name: "Clinique Zénith", pin: "1234", password: "secret", totp_code: "000000" });
    const serialise = JSON.stringify(etat.appelsRpc[0].args);
    for (const mot of ["1234", "secret", "000000", "pin", "password", "totp"]) expect(serialise).not.toContain(mot);
  });

  it("corps complet identique à l'existant → pas de 403 même sans réauth", async () => {
    const { status } = await put({ name: "Clinique Aurore", ville: "Conakry", adresse: "Rue 1", latitude: 9.5, longitude: -13.7, description: "d" });
    expect(status).toBe(200);
    expect(etat.appelsRpc).toHaveLength(1);
  });

  it("simple changement de casse/espaces → pas de 403 sans réauth", async () => {
    const { status } = await put({ name: "  CLINIQUE   aurore " });
    expect(status).toBe(200);
  });

  it("bruit de coordonnées sous 1e-6 → pas de 403 ; vrai déplacement → 403", async () => {
    expect((await put({ latitude: 9.5000000001, longitude: -13.7 })).status).toBe(200);
    const deplace = await put({ latitude: 9.51, longitude: -13.7 });
    expect(deplace.status).toBe(403);
    expect(deplace.json.code).toBe("REAUTH_REQUIRED");
  });

  it("chaîne vide de coordonnée → null ; chaîne numérique → nombre", async () => {
    h.estReauthRecente.mockReturnValue(true);
    await put({ latitude: "", longitude: "-13.8" });
    expect(etat.appelsRpc[0].args.p_champs).toEqual({ latitude: null, longitude: -13.8 });
  });

  it("changement de catégorie/activité principale sans réauth → 403, aucune écriture", async () => {
    const { status, json } = await put({ activite_categorie_id: "cat-2", activite_principale_id: "act-2", activites_secondaires_ids: [] });
    expect(status).toBe(403);
    expect(json.code).toBe("REAUTH_REQUIRED");
    expect(etat.appelsRpc).toHaveLength(0);
  });

  it("changement de catégorie/activité principale avec réauth → transmis à la fonction SQL, rien écrit directement", async () => {
    h.estReauthRecente.mockReturnValue(true);
    const { status } = await put({ activite_categorie_id: "cat-2", activite_principale_id: "act-2", activites_secondaires_ids: [] });
    expect(status).toBe(200);
    expect(etat.appelsRpc[0].args.p_champs).toEqual({ activite_categorie_id: "cat-2", activite_principale_id: "act-2", activites_secondaires_ids: [] });
    expect(etat.majInstitutions).toHaveLength(0);
  });

  it("activités secondaires seules (niveau A) → pas de 403 sans réauth", async () => {
    etat.institution.activite_categorie_id = "cat-2";
    etat.activites = [{ activite_id: "act-2", principale: true }];
    const { status } = await put({ activite_categorie_id: "cat-2", activite_principale_id: "act-2", activites_secondaires_ids: ["act-3"] });
    expect(status).toBe(200);
    expect(etat.appelsRpc).toHaveLength(1);
  });
});

describe("PUT /api/institution/profile — erreurs", () => {
  it("la fonction SQL répond YR001 (réauth expirée entre-temps) → 403 REAUTH_REQUIRED", async () => {
    h.estReauthRecente.mockReturnValue(true);
    etat.rpcReponse = { data: null, error: { code: "YR001", message: "REAUTH_REQUIRED" } };
    const { status, json } = await put({ name: "Clinique Zénith" });
    expect(status).toBe(403);
    expect(json.code).toBe("REAUTH_REQUIRED");
  });

  it("autre erreur de la fonction SQL → 500 générique sans fuite, niveau A non écrit", async () => {
    h.estReauthRecente.mockReturnValue(true);
    etat.rpcReponse = { data: null, error: { code: "23503", message: "insert or update on table \"institution_activites\" violates foreign key constraint" } };
    const { status, json } = await put({ name: "Clinique Zénith", description: "d" });
    expect(status).toBe(500);
    expect(JSON.stringify(json)).not.toContain("foreign key");
    expect(JSON.stringify(json)).not.toContain("institution_activites");
    expect(etat.majInstitutions).toHaveLength(0);
  });

  it("la fonction SQL est appelée avant l'écriture des champs de niveau A", async () => {
    h.estReauthRecente.mockReturnValue(true);
    await put({ name: "Clinique Zénith", description: "d" });
    expect(etat.ordre).toEqual(["rpc", "update_institutions"]);
  });

  it("valeurs invalides → 400 avant tout appel", async () => {
    h.estReauthRecente.mockReturnValue(true);
    for (const corps of [{ name: "   " }, { name: 42 }, { ville: "" }, { latitude: 200 }, { longitude: "abc" }, { adresse: 12 }]) {
      const { status } = await put(corps);
      expect(status).toBe(400);
    }
    expect(etat.appelsRpc).toHaveLength(0);
    expect(etat.majInstitutions).toHaveLength(0);
  });

  it("statut juridique différent avec documents soumis → 409, fonction SQL jamais appelée, statut juridique jamais transmis", async () => {
    etat.nbDocuments = 2;
    const { status } = await put({ statut_juridique: "public", name: "Clinique Aurore" });
    expect(status).toBe(409);
    expect(etat.appelsRpc).toHaveLength(0);
    expect(etat.majInstitutions).toHaveLength(0);
  });

  it("statut juridique n'est jamais transmis à la fonction SQL", async () => {
    h.estReauthRecente.mockReturnValue(true);
    await put({ statut_juridique: "prive_formel", name: "Clinique Zénith" });
    expect(etat.appelsRpc[0].args.p_champs).not.toHaveProperty("statut_juridique");
  });

  it("corps invalide → 400", async () => {
    const { PUT } = await import("./route");
    const res = await PUT(new NextRequest("http://localhost/api/institution/profile", { method: "PUT", body: "pas du json" }));
    expect(res.status).toBe(400);
  });
});

describe("PUT /api/institution/profile — publication différée", () => {
  it("renvoyer telle quelle une proposition en attente n'est pas un nouveau changement (pas de réauth redemandée)", async () => {
    etat.propositions = [{ champ: "name", nouvelle_valeur: "Clinique Zénith" }];
    const { status } = await put({ name: "Clinique Zénith", description: "d" });
    expect(status).toBe(200);
    expect(h.estReauthRecente).not.toHaveBeenCalled();
  });

  it("revenir à la valeur PUBLIÉE alors qu'une proposition est en attente est un changement sensible (réauth exigée)", async () => {
    etat.propositions = [{ champ: "name", nouvelle_valeur: "Clinique Zénith" }];
    const { status, json } = await put({ name: "Clinique Aurore" });
    expect(status).toBe(403);
    expect(json.code).toBe("REAUTH_REQUIRED");
    expect(etat.appelsRpc).toHaveLength(0);
  });

  it("une nouvelle valeur différente de la proposition en attente est un changement sensible", async () => {
    etat.propositions = [{ champ: "ville", nouvelle_valeur: "Kindia" }];
    const { status } = await put({ ville: "Labé" });
    expect(status).toBe(403);
  });

  it("établissement non public : application directe journalisée (publie_directement), sans demande", async () => {
    h.estReauthRecente.mockReturnValue(true);
    etat.rpcReponse = { data: { demandes: [], appliquees: ["name"], retirees: [] }, error: null };
    const { status, json } = await put({ name: "Clinique Zénith" });
    expect(status).toBe(200);
    expect(json.demandes).toEqual([]);
    expect(json.appliques).toEqual(["name"]);
    expect(h.enregistrerAction).toHaveBeenCalledTimes(1);
    expect(h.enregistrerAction.mock.calls[0][0]).toMatchObject({
      action: "changement_profil_sensible", cibleTable: "institutions", cibleId: INSTITUTION,
      details: { champ: "name", publie_directement: true },
      ancienneValeur: { name: "Clinique Aurore" }, nouvelleValeur: { name: "Clinique Zénith" },
    });
  });

  it("le journal d'une proposition garde pour 'avant' la valeur PUBLIÉE, pas une proposition antérieure", async () => {
    h.estReauthRecente.mockReturnValue(true);
    etat.propositions = [{ champ: "name", nouvelle_valeur: "Proposition A" }];
    etat.rpcReponse = { data: { demandes: [{ id: "d2", numero: "YL-CHG-2026-00000002", champ: "name" }], appliquees: [], retirees: ["name"] }, error: null };
    await put({ name: "Proposition B" });
    expect(h.enregistrerAction.mock.calls[0][0]).toMatchObject({
      ancienneValeur: { name: "Clinique Aurore" }, nouvelleValeur: { name: "Proposition B" },
    });
  });
});

describe("GET /api/institution/profile — l'établissement voit sa proposition", () => {
  async function get() {
    const { GET } = await import("./route");
    const res = await GET(new NextRequest(`http://localhost/api/institution/profile?institution_id=${INSTITUTION}`));
    return { status: res.status, json: await res.json() };
  }

  it("sans proposition en attente : valeurs publiées, aucun champ en attente", async () => {
    const { status, json } = await get();
    expect(status).toBe(200);
    expect(json.institution.name).toBe("Clinique Aurore");
    expect(json.institution.champs_en_attente).toEqual([]);
  });

  it("avec une proposition de nom et d'adresse : l'établissement voit les NOUVELLES valeurs, champs_en_attente les liste", async () => {
    etat.propositions = [
      { champ: "name", nouvelle_valeur: "Clinique Zénith" },
      { champ: "adresse", nouvelle_valeur: "Rue 99" },
    ];
    const { json } = await get();
    expect(json.institution.name).toBe("Clinique Zénith");
    expect(json.institution.adresse).toBe("Rue 99");
    expect(json.institution.ville).toBe("Conakry");
    expect(json.institution.champs_en_attente.sort()).toEqual(["adresse", "name"]);
  });

  it("proposition d'activité : catégorie et activité principale surchargées, code d'activité recalculé", async () => {
    etat.propositions = [{ champ: "activite", nouvelle_valeur: { activite_categorie_id: "cat-9", activite_principale_id: "act-9" } }];
    const { json } = await get();
    expect(json.institution.activite_categorie_id).toBe("cat-9");
    expect(json.institution.activite_principale_id).toBe("act-9");
    expect(json.institution.activite_principale_code).toBe("hotellerie");
  });

  it("401 sans session et 403 pour un autre établissement", async () => {
    h.getAuthenticatedMembre.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    h.getAuthenticatedMembre.mockResolvedValue({ ...membre(), institutionId: AUTRE_INSTITUTION });
    expect((await get()).status).toBe(403);
  });
});
