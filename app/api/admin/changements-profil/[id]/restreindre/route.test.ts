import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Restriction de l'accès citoyen liée à une demande (Lot 3). La fonction SQL
// restreindre_acces_changement_profil est simulée : ses garanties (suspension
// atomique, événement lié, droits) sont vérifiées par les garde-fous statiques
// des migrations 20261020000003/4 et leur script de scénarios. Ici : permission
// institutions.manage, confirmation explicite, validation, administrateur issu de
// la session, notification, mapping d'erreurs.

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
    async rpc(nom: string, args: Record<string, unknown>) {
      etat.appelsRpc.push({ nom, args });
      return etat.rpcReponse;
    },
  })),
}));

const ID = "11111111-1111-1111-1111-111111111111";
const ADMIN = "22222222-2222-2222-2222-222222222222";
const REPONSE_OK = { reference: "SUS-2026-00000042", institution_id: INSTITUTION, demande_id: ID, numero: "YL-CHG-2026-00000001", champ: "name", jusqu_au: null, name: "Clinique Aurore" };

async function post(body: unknown, id = ID) {
  const { POST } = await import("./route");
  const res = await POST(
    new NextRequest(`http://localhost/api/admin/changements-profil/${id}/restreindre`, {
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
  etat.rpcReponse = { data: REPONSE_OK, error: null };
});

describe("POST /api/admin/changements-profil/[id]/restreindre", () => {
  it("exige institutions.manage (comme la suspension) ; refus sans appel SQL", async () => {
    const { AdminAuthError } = await import("@/lib/adminAuth");
    h.authorizeAdmin.mockRejectedValue(new AdminAuthError(403, "FORBIDDEN"));
    expect((await post({ motif: "Documents non conformes", confirme: true })).status).toBe(403);
    expect(etat.appelsRpc).toHaveLength(0);
    expect(h.authorizeAdmin).toHaveBeenCalledWith(expect.anything(), "institutions.manage");
  });

  it("refuse sans confirmation explicite (action lourde), même si le motif est valide", async () => {
    for (const confirme of [undefined, false, "true", 1, null]) {
      expect((await post({ motif: "Documents non conformes", confirme })).status).toBe(400);
    }
    expect(etat.appelsRpc).toHaveLength(0);
  });

  it("transmet motif et durée avec l'administrateur de la SESSION, jamais celui du corps", async () => {
    const { status, json } = await post({ motif: "  Documents non conformes  ", duree_jours: 30, confirme: true, p_admin_id: "pirate" });
    expect(status).toBe(200);
    expect(json).toEqual({ ok: true, reference: "SUS-2026-00000042", notifie: true });
    expect(etat.appelsRpc[0].nom).toBe("restreindre_acces_changement_profil");
    expect(etat.appelsRpc[0].args).toEqual({ p_demande_id: ID, p_admin_id: ADMIN, p_motif: "Documents non conformes", p_duree_jours: 30 });
    expect(JSON.stringify(etat.appelsRpc[0].args)).not.toContain("pirate");
  });

  it("durée facultative (null = jusqu'à nouvel ordre), bornée à 1–365 entiers", async () => {
    await post({ motif: "ok", confirme: true });
    expect(etat.appelsRpc[0].args.p_duree_jours).toBeNull();
    for (const duree of [0, -1, 366, 1.5, "30"]) {
      expect((await post({ motif: "ok", duree_jours: duree, confirme: true })).status).toBe(400);
    }
    expect(etat.appelsRpc).toHaveLength(1);
  });

  it("motif obligatoire et borné, identifiant UUID", async () => {
    for (const corps of [{ confirme: true }, { motif: "", confirme: true }, { motif: "   ", confirme: true }, { motif: 3, confirme: true }, { motif: "x".repeat(1001), confirme: true }]) {
      expect((await post(corps)).status).toBe(400);
    }
    expect((await post({ motif: "ok", confirme: true }, "pas-un-uuid")).status).toBe(400);
    expect(etat.appelsRpc).toHaveLength(0);
  });

  it("notifie l'établissement de la DEMANDE (réponse SQL) avec référence, motif et voie de révision", async () => {
    await post({ motif: "Documents non conformes", confirme: true, institution_id: "pirate" });
    expect(h.envoyerNotification).toHaveBeenCalledTimes(1);
    const params = h.envoyerNotification.mock.calls[0][0];
    expect(params).toMatchObject({ destinataireId: INSTITUTION, destinataireType: "institution", rdvId: null, type: "institution_suspendue" });
    const message = String(params.message);
    expect(message).toContain("SUS-2026-00000042");
    expect(message).toContain("« Documents non conformes »");
    expect(message).toContain("demander une révision");
    expect(message).toContain("jusqu'à nouvel ordre");
    expect(JSON.stringify(params)).not.toContain("pirate");
  });

  it("une durée apparaît dans le message", async () => {
    etat.rpcReponse = { data: { ...REPONSE_OK, jusqu_au: "2026-11-19T10:00:00Z" }, error: null };
    await post({ motif: "ok", duree_jours: 30, confirme: true });
    expect(String(h.envoyerNotification.mock.calls[0][0].message)).toContain("jusqu'au");
  });

  it("demande déjà traitée ou établissement déjà restreint → 409 explicite, aucune notification", async () => {
    etat.rpcReponse = { data: null, error: { message: "restreindre_acces_changement_profil: cette demande n'est plus a l'etat a_examiner (statut actuel=examinee)" } };
    const a = await post({ motif: "ok", confirme: true });
    expect(a.status).toBe(409);
    expect(a.json.code).toBe("CONFLIT_CONCURRENCE");
    etat.rpcReponse = { data: null, error: { message: "restreindre_acces_changement_profil: etablissement deja restreint ou non public (statut actuel=suspendue)" } };
    const b = await post({ motif: "ok", confirme: true });
    expect(b.status).toBe(409);
    expect(b.json.code).toBe("DEJA_RESTREINT");
    expect(h.envoyerNotification).not.toHaveBeenCalled();
  });

  it("autre erreur SQL → 500 générique sans fuite", async () => {
    etat.rpcReponse = { data: null, error: { code: "XX000", message: "relation secrete admin_id=secret-123" } };
    const { status, json } = await post({ motif: "ok", confirme: true });
    expect(status).toBe(500);
    expect(JSON.stringify(json)).not.toContain("secret-123");
  });

  it("un échec d'envoi n'annule pas la restriction déjà enregistrée (200, notifie=false)", async () => {
    h.envoyerNotification.mockRejectedValueOnce(new Error("push indisponible"));
    const { status, json } = await post({ motif: "ok", confirme: true });
    expect(status).toBe(200);
    expect(json.notifie).toBe(false);
    expect(json.reference).toBe("SUS-2026-00000042");
  });
});
