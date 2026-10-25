import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Suivi côté établissement de ses demandes d'examen de changement de profil.
// Points de sécurité vérifiés ici : session obligatoire, rôle, institution
// issue de la SESSION uniquement (jamais d'un paramètre), aucune donnée
// d'administrateur ni d'IP exposée, erreurs sans fuite.

const h = vi.hoisted(() => ({ getAuthenticatedMembre: vi.fn() }));
vi.mock("@/lib/institutionAuth", () => ({ getAuthenticatedMembre: h.getAuthenticatedMembre }));

type Ligne = Record<string, unknown>;
const etat = {
  filtres: [] as [string, unknown][],
  lignes: [] as Ligne[],
  count: 0,
  evenements: [] as Ligne[],
  erreur: null as { message: string } | null,
};
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from(table: string) {
      if (table === "institution_change_request_events") {
        const evts = {
          select: () => evts,
          eq: (col: string, val: unknown) => { etat.filtres.push([col, val]); return evts; },
          in: () => evts,
          order: async () => ({ data: etat.erreur ? null : etat.evenements, error: etat.erreur }),
        };
        return evts;
      }
      if (table !== "institution_change_requests") throw new Error(`table non simulée: ${table}`);
      const builder = {
        select: (_colonnes?: string, _options?: { count?: string; head?: boolean }) => builder,
        eq: (col: string, val: unknown) => { etat.filtres.push([col, val]); return builder; },
        order: () => builder,
        limit: async () => ({ data: etat.erreur ? null : etat.lignes, error: etat.erreur }),
        // Requête de comptage (?resume=1) : le constructeur est attendu après les .eq().
        then: (resolve: (v: { count: number; error: { message: string } | null }) => void) => resolve({ count: etat.count, error: etat.erreur }),
      };
      return builder;
    },
  })),
}));

const INSTITUTION = "11111111-1111-1111-1111-111111111111";
const AUTRE = "22222222-2222-2222-2222-222222222222";

function membre(role = "admin") {
  return { institutionId: INSTITUTION, membreId: "m1", role, sid: "s1", reauthAt: null, accesRestreints: null };
}
async function get(url = "http://localhost/api/institution/changements-profil") {
  const { GET } = await import("./route");
  const res = await GET(new NextRequest(url));
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => { await import("./route"); }, 60_000);
beforeEach(() => {
  vi.clearAllMocks();
  h.getAuthenticatedMembre.mockResolvedValue(membre());
  etat.filtres = [];
  etat.erreur = null;
  etat.evenements = [];
  etat.lignes = [
    {
      id: "d1", numero: "YL-CHG-2026-00000001", champ: "name", ancienne_valeur: "Ancien nom", nouvelle_valeur: "Nouveau nom",
      statut: "examinee", decision: "a_corriger", commentaire_admin: "Merci de préciser", decide_le: "2026-10-20T10:00:00Z", created_at: "2026-10-19T10:00:00Z",
      decide_par_nom: "Admin Secret", ip: "203.0.113.1", user_agent: "ua", membre_nom: "Membre", institution_id: INSTITUTION,
    },
  ];
});

describe("GET /api/institution/changements-profil", () => {
  it("401 sans session", async () => {
    h.getAuthenticatedMembre.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("403 si le rôle n'a pas profil_entreprise.write", async () => {
    h.getAuthenticatedMembre.mockResolvedValue(membre("comptable"));
    expect((await get()).status).toBe(403);
    expect(etat.filtres).toHaveLength(0);
  });

  it("filtre sur l'institution de la SESSION, jamais sur un paramètre de requête", async () => {
    await get(`http://localhost/api/institution/changements-profil?institution_id=${AUTRE}`);
    expect(etat.filtres).toEqual([["institution_id", INSTITUTION]]);
  });

  it("expose le libellé, les valeurs affichables et le commentaire, mais ni admin, ni IP, ni user-agent", async () => {
    const { status, json } = await get();
    expect(status).toBe(200);
    expect(json.demandes).toHaveLength(1);
    expect(json.demandes[0]).toMatchObject({
      numero: "YL-CHG-2026-00000001", champ_libelle: "Nom", ancienne_affichage: "Ancien nom", nouvelle_affichage: "Nouveau nom",
      statut: "examinee", decision: "a_corriger", commentaire_admin: "Merci de préciser",
    });
    const brut = JSON.stringify(json);
    for (const secret of ["Admin Secret", "203.0.113.1", "user_agent", "decide_par", "institution_id", "membre_nom"]) {
      expect(brut).not.toContain(secret);
    }
  });

  it("?resume=1 : renvoie seulement le nombre de demandes en cours d'examen de CETTE institution", async () => {
    etat.count = 2;
    const { status, json } = await get("http://localhost/api/institution/changements-profil?resume=1&institution_id=" + AUTRE);
    expect(status).toBe(200);
    expect(json).toEqual({ en_cours: 2 });
    expect(etat.filtres).toEqual([["institution_id", INSTITUTION], ["statut", "a_examiner"]]);
  });

  it("?resume=1 : 401 sans session et 403 sans le droit, comme la liste", async () => {
    h.getAuthenticatedMembre.mockResolvedValue(null);
    expect((await get("http://localhost/api/institution/changements-profil?resume=1")).status).toBe(401);
    h.getAuthenticatedMembre.mockResolvedValue(membre("comptable"));
    expect((await get("http://localhost/api/institution/changements-profil?resume=1")).status).toBe(403);
  });

  it("?resume=1 : zéro demande en cours → 0 (la pastille rouge disparaît)", async () => {
    etat.count = 0;
    expect((await get("http://localhost/api/institution/changements-profil?resume=1")).json).toEqual({ en_cours: 0 });
  });

  it("erreur base → 500 générique sans fuite", async () => {
    etat.erreur = { message: "relation secrète introuvable" };
    const { status, json } = await get();
    expect(status).toBe(500);
    expect(JSON.stringify(json)).not.toContain("secrète");
  });
});

describe("GET /api/institution/changements-profil — échanges de compléments", () => {
  it("expose les échanges d'une demande ouverte sans nom d'administrateur ni de membre, et déduit l'état", async () => {
    etat.lignes = [{
      id: "d9", numero: "YL-CHG-2026-00000009", champ: "name", ancienne_valeur: "A", nouvelle_valeur: "B",
      statut: "a_examiner", decision: null, commentaire_admin: null, decide_le: null, created_at: "2026-10-20T10:00:00Z",
    }];
    etat.evenements = [
      { request_id: "d9", type: "complement_demande", message: "Précisez l'ancien nom", types_documents: ["rccm"], created_at: "2026-10-20T11:00:00Z",
        acteur_nom: "Admin Secret", acteur_id: "adm-1" },
    ];
    const { json } = await get();
    const d = json.demandes[0];
    expect(d.etat_complement).toBe("demande");
    expect(d.evenements).toEqual([
      { type: "complement_demande", message: "Précisez l'ancien nom", types_documents_libelles: ["Registre de Commerce (RCCM)"], created_at: "2026-10-20T11:00:00Z" },
    ]);
    const brut = JSON.stringify(json);
    for (const secret of ["Admin Secret", "adm-1", "acteur_nom", "acteur_id"]) expect(brut).not.toContain(secret);
    expect(etat.filtres).toContainEqual(["institution_id", INSTITUTION]);
  });

  it("une réponse de l'établissement place la demande à l'état « fourni »", async () => {
    etat.lignes = [{
      id: "d9", numero: "YL-CHG-2026-00000009", champ: "ville", ancienne_valeur: "A", nouvelle_valeur: "B",
      statut: "a_examiner", decision: null, commentaire_admin: null, decide_le: null, created_at: "2026-10-20T10:00:00Z",
    }];
    etat.evenements = [
      { request_id: "d9", type: "complement_demande", message: "Précisez", types_documents: [], created_at: "2026-10-20T11:00:00Z" },
      { request_id: "d9", type: "complement_fourni", message: "Fait", types_documents: [], created_at: "2026-10-20T12:00:00Z" },
    ];
    expect((await get()).json.demandes[0].etat_complement).toBe("fourni");
  });

  it("une demande déjà examinée n'interroge pas le journal d'échanges", async () => {
    etat.evenements = [{ request_id: "d1", type: "complement_demande", message: "x", types_documents: [], created_at: "2026-10-20T11:00:00Z" }];
    const { json } = await get();
    expect(json.demandes[0].evenements).toEqual([]);
    expect(json.demandes[0].etat_complement).toBe("aucun");
  });
});
