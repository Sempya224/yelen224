import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Demande de complément (Lot 2, docs/product/YELEN_REVERIFICATION_POLICY.md).
// La fonction SQL demander_complement_changement_profil est simulée : ses
// garanties (événement immuable, admin_logs dans la même transaction, demande
// encore ouverte) sont vérifiées par les garde-fous statiques de la migration
// 20261020000002 et son script de scénarios. Ici : permission, validation,
// administrateur issu de la session, notification, mapping d'erreurs.

const h = vi.hoisted(() => ({
  authorizeAdmin: vi.fn(),
  envoyerNotification: vi.fn(async (_params: Record<string, unknown>) => {}),
}));
vi.mock("@/lib/notificationEngine", () => ({
  envoyerNotification: h.envoyerNotification,
  salutation: (nom: string) => `Bonjour ${nom}`,
}));
vi.mock("@/lib/adminAuth", () => {
  class AdminAuthError extends Error {
    status: 401 | 403;
    code: string;
    constructor(status: 401 | 403, code: string) { super(code); this.status = status; this.code = code; }
  }
  return {
    AdminAuthError,
    authorizeAdmin: h.authorizeAdmin,
    adminAuthErrorResponse: (e: unknown) => NextResponse.json({ error: "refusé" }, { status: e instanceof AdminAuthError ? e.status : 500 }),
  };
});

const INSTITUTION = "99999999-9999-9999-9999-999999999999";
const etat = {
  appelsRpc: [] as { nom: string; args: Record<string, unknown> }[],
  rpcReponse: { data: null as unknown, error: null as { code?: string; message: string } | null },
};
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { name: "Clinique Aurore" }, error: null }) }) }) }),
    async rpc(nom: string, args: Record<string, unknown>) {
      etat.appelsRpc.push({ nom, args });
      return etat.rpcReponse;
    },
  })),
}));

const ID = "11111111-1111-1111-1111-111111111111";
const ADMIN = "22222222-2222-2222-2222-222222222222";

async function post(body: unknown, id = ID) {
  const { POST } = await import("./route");
  const res = await POST(
    new NextRequest(`http://localhost/api/admin/changements-profil/${id}/complement`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) }
  );
  return { status: res.status, json: await res.json() };
}

beforeAll(async () => { await import("./route"); }, 60_000);
beforeEach(() => {
  vi.clearAllMocks();
  h.authorizeAdmin.mockResolvedValue({ adminId: ADMIN });
  etat.appelsRpc = [];
  etat.rpcReponse = { data: { id: "e1", demande_id: ID, numero: "YL-CHG-2026-00000001", institution_id: INSTITUTION, champ: "name" }, error: null };
});

describe("POST /api/admin/changements-profil/[id]/complement", () => {
  it("exige institutions.verify ; refus sans appel SQL", async () => {
    const { AdminAuthError } = await import("@/lib/adminAuth");
    h.authorizeAdmin.mockRejectedValue(new AdminAuthError(403, "FORBIDDEN"));
    expect((await post({ motif: "Le RCCM porte l'ancien nom" })).status).toBe(403);
    expect(etat.appelsRpc).toHaveLength(0);
    expect(h.authorizeAdmin).toHaveBeenCalledWith(expect.anything(), "institutions.verify");
  });

  it("transmet motif et pièces avec l'administrateur de la SESSION, jamais celui du corps", async () => {
    const { status, json } = await post({ motif: "  Le RCCM porte l'ancien nom  ", types_documents: ["rccm", "rccm", "piece_identite"], p_admin_id: "pirate", admin_id: "pirate" });
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true, notifie: true });
    expect(etat.appelsRpc[0].nom).toBe("demander_complement_changement_profil");
    expect(etat.appelsRpc[0].args).toEqual({
      p_demande_id: ID, p_admin_id: ADMIN, p_motif: "Le RCCM porte l'ancien nom", p_types_documents: ["rccm", "piece_identite"],
    });
    expect(JSON.stringify(etat.appelsRpc[0].args)).not.toContain("pirate");
  });

  it("motif obligatoire, borné, types de documents connus et limités", async () => {
    for (const corps of [{}, { motif: "" }, { motif: "   " }, { motif: 12 }, { motif: "x".repeat(1001) },
                         { motif: "ok", types_documents: "rccm" }, { motif: "ok", types_documents: ["inconnu"] },
                         { motif: "ok", types_documents: new Array(7).fill("rccm") }]) {
      expect((await post(corps)).status).toBe(400);
    }
    expect((await post({ motif: "ok" }, "pas-un-uuid")).status).toBe(400);
    expect(etat.appelsRpc).toHaveLength(0);
  });

  it("notifie l'établissement de la DEMANDE (lu en base) avec le motif et les libellés de pièces", async () => {
    await post({ motif: "Document non conforme", types_documents: ["rccm"], institution_id: "pirate" });
    expect(h.envoyerNotification).toHaveBeenCalledTimes(1);
    const params = h.envoyerNotification.mock.calls[0][0];
    expect(params).toMatchObject({ destinataireId: INSTITUTION, destinataireType: "institution", rdvId: null, type: "changement_profil_complement" });
    expect(String(params.message)).toContain("« Document non conforme »");
    expect(String(params.message)).toContain("Registre de Commerce (RCCM)");
    expect(String(params.message)).toContain("onglet Documents");
    expect(JSON.stringify(params)).not.toContain("pirate");
  });

  it("demande déjà traitée → 409 CONFLIT_CONCURRENCE, aucune notification", async () => {
    etat.rpcReponse = { data: null, error: { message: "demander_complement_changement_profil: cette demande n'est plus a l'etat a_examiner (statut actuel=examinee)" } };
    const { status, json } = await post({ motif: "Encore un complément" });
    expect(status).toBe(409);
    expect(json.code).toBe("CONFLIT_CONCURRENCE");
    expect(h.envoyerNotification).not.toHaveBeenCalled();
  });

  it("autre erreur SQL → 500 générique sans fuite", async () => {
    etat.rpcReponse = { data: null, error: { code: "P0001", message: "administrateur inconnu ou inactif (admin_id=secret-123)" } };
    const { status, json } = await post({ motif: "Complément" });
    expect(status).toBe(500);
    expect(JSON.stringify(json)).not.toContain("secret-123");
    expect(h.envoyerNotification).not.toHaveBeenCalled();
  });

  it("un échec d'envoi n'annule pas la demande déjà enregistrée (200, notifie=false)", async () => {
    h.envoyerNotification.mockRejectedValueOnce(new Error("push indisponible"));
    const { status, json } = await post({ motif: "Complément" });
    expect(status).toBe(200);
    expect(json.notifie).toBe(false);
  });
});
