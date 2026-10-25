import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Réponse de l'établissement à une demande de complément (Lot 2). La fonction SQL
// repondre_complement_changement_profil est simulée (ses garanties sont vérifiées
// par la migration 20261020000002 et ses scénarios). Ici : session, rôle,
// institution / membre issus de la SESSION uniquement, validation, mapping d'erreurs,
// journal d'activité.

const h = vi.hoisted(() => ({
  getAuthenticatedMembre: vi.fn(),
  enregistrerAction: vi.fn(async (_params: Record<string, unknown>) => {}),
}));
vi.mock("@/lib/institutionAuth", () => ({ getAuthenticatedMembre: h.getAuthenticatedMembre }));
vi.mock("@/lib/journalActivite", () => ({
  enregistrerAction: h.enregistrerAction,
  getMembreNomPourJournal: vi.fn(async () => "Membre Test"),
}));

const etat = {
  appelsRpc: [] as { nom: string; args: Record<string, unknown> }[],
  rpcReponse: { data: null as unknown, error: null as { code?: string; message: string } | null },
};
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    async rpc(nom: string, args: Record<string, unknown>) {
      etat.appelsRpc.push({ nom, args });
      return etat.rpcReponse;
    },
  })),
}));

const INSTITUTION = "11111111-1111-1111-1111-111111111111";
const AUTRE = "22222222-2222-2222-2222-222222222222";
const MEMBRE = "33333333-3333-3333-3333-333333333333";
const DEMANDE = "44444444-4444-4444-4444-444444444444";

function membre(role = "admin") {
  return { institutionId: INSTITUTION, membreId: MEMBRE, role, sid: "s1", reauthAt: null, accesRestreints: null };
}
async function post(body: unknown, id = DEMANDE) {
  const { POST } = await import("./route");
  const res = await POST(
    new NextRequest(`http://localhost/api/institution/changements-profil/${id}/repondre`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => { await import("./route"); }, 60_000);
beforeEach(() => {
  vi.clearAllMocks();
  h.getAuthenticatedMembre.mockResolvedValue(membre());
  etat.appelsRpc = [];
  etat.rpcReponse = { data: { id: "e2", demande_id: DEMANDE, numero: "YL-CHG-2026-00000001", champ: "name" }, error: null };
});

describe("POST /api/institution/changements-profil/[id]/repondre", () => {
  it("401 sans session, 403 sans le droit, aucun appel SQL", async () => {
    h.getAuthenticatedMembre.mockResolvedValue(null);
    expect((await post({ message: "ok" })).status).toBe(401);
    h.getAuthenticatedMembre.mockResolvedValue(membre("comptable"));
    expect((await post({ message: "ok" })).status).toBe(403);
    expect(etat.appelsRpc).toHaveLength(0);
  });

  it("institution et membre viennent de la SESSION, jamais du corps", async () => {
    const { status } = await post({ message: "  Document déposé  ", institution_id: AUTRE, membre_id: "pirate", p_institution_id: AUTRE });
    expect(status).toBe(200);
    expect(etat.appelsRpc[0].nom).toBe("repondre_complement_changement_profil");
    expect(etat.appelsRpc[0].args).toEqual({ p_demande_id: DEMANDE, p_institution_id: INSTITUTION, p_membre_id: MEMBRE, p_message: "Document déposé" });
    expect(JSON.stringify(etat.appelsRpc[0].args)).not.toContain("pirate");
  });

  it("le message est facultatif (null) mais borné et textuel", async () => {
    expect((await post({})).status).toBe(200);
    expect(etat.appelsRpc[0].args.p_message).toBeNull();
    expect((await post({ message: 12 })).status).toBe(400);
    expect((await post({ message: "x".repeat(1001) })).status).toBe(400);
    expect(etat.appelsRpc).toHaveLength(1);
  });

  it("identifiant non UUID → 400", async () => {
    expect((await post({ message: "ok" }, "pas-un-uuid")).status).toBe(400);
    expect(etat.appelsRpc).toHaveLength(0);
  });

  it("aucun complément attendu ou demande déjà traitée → 409", async () => {
    etat.rpcReponse = { data: null, error: { message: "repondre_complement_changement_profil: aucun complement n'est attendu pour cette demande" } };
    const { status, json } = await post({ message: "ok" });
    expect(status).toBe(409);
    expect(json.code).toBe("AUCUN_COMPLEMENT_ATTENDU");
    etat.rpcReponse = { data: null, error: { message: "repondre_complement_changement_profil: cette demande n'est plus a l'etat a_examiner (statut actuel=examinee)" } };
    expect((await post({ message: "ok" })).status).toBe(409);
  });

  it("demande d'un autre établissement ou inconnue → 404 sans fuite", async () => {
    etat.rpcReponse = { data: null, error: { message: "repondre_complement_changement_profil: demande inconnue" } };
    const { status, json } = await post({ message: "ok" });
    expect(status).toBe(404);
    expect(JSON.stringify(json)).not.toContain("repondre_complement");
  });

  it("autre erreur SQL → 500 générique, aucun journal", async () => {
    etat.rpcReponse = { data: null, error: { code: "XX000", message: "relation secrète" } };
    const { status, json } = await post({ message: "ok" });
    expect(status).toBe(500);
    expect(JSON.stringify(json)).not.toContain("secrète");
    expect(h.enregistrerAction).not.toHaveBeenCalled();
  });

  it("journalise la réponse dans le journal d'activité de l'établissement", async () => {
    await post({ message: "ok" });
    expect(h.enregistrerAction).toHaveBeenCalledTimes(1);
    expect(h.enregistrerAction.mock.calls[0][0]).toMatchObject({
      institutionId: INSTITUTION, membreId: MEMBRE, membreNom: "Membre Test",
      action: "changement_profil_complement_fourni", cibleTable: "institution_change_requests", cibleId: DEMANDE,
      details: { numero: "YL-CHG-2026-00000001", champ: "name" },
    });
  });
});
