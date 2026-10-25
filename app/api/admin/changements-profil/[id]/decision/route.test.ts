import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

// Décision admin sur une demande de changement de profil
// (docs/product/YELEN_REVERIFICATION_POLICY.md §3). La fonction SQL
// decider_changement_profil est simulée : son comportement réel (transition
// unique, admin_logs, verrouillage optimiste, aucune écriture sur
// institutions) est vérifié par le script de scénarios SQL et les garde-fous
// statiques de la migration 20261020000001. Ici : permission, validation,
// administrateur issu de la session, mapping des erreurs.

vi.mock("@/lib/institutionSlug", () => ({ generateInstitutionSlug: vi.fn(async (_sb: unknown, nom: string) => `slug-${nom.toLowerCase().replaceAll(" ", "-")}`) }));

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

const INSTITUTION_DEMANDE = "99999999-9999-9999-9999-999999999999";
const etat = {
  demande: { institution_id: INSTITUTION_DEMANDE, champ: "name", nouvelle_valeur: "Nouveau Nom" } as { institution_id: string; champ: string; nouvelle_valeur: unknown } | null,
  appelsRpc: [] as { nom: string; args: Record<string, unknown> }[],
  rpcReponse: { data: null as unknown, error: null as { code?: string; message: string } | null },
};
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from(table: string) {
      const donnees = table === "institution_change_requests" ? etat.demande : table === "institutions" ? { name: "Clinique Aurore" } : undefined;
      if (donnees === undefined) throw new Error(`table non simulée: ${table}`);
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: donnees, error: null }) }) }) };
    },
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
    new NextRequest(`http://localhost/api/admin/changements-profil/${id}/decision`, {
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
  etat.demande = { institution_id: INSTITUTION_DEMANDE, champ: "name", nouvelle_valeur: "Nouveau Nom" };
  etat.rpcReponse = { data: { id: ID, numero: "YL-CHG-2026-00000001", decision: "conforme", institution_id: INSTITUTION_DEMANDE, champ: "name", publiee: true }, error: null };
});

describe("notification de l'établissement après décision", () => {
  it("conforme : notifie l'établissement de la DEMANDE (lu en base), jamais celui du corps", async () => {
    const { status, json } = await post({ decision: "conforme", statut_vu: "a_examiner", institution_id: "pirate" });
    expect(status).toBe(200);
    expect(json.notifie).toBe(true);
    expect(h.envoyerNotification).toHaveBeenCalledTimes(1);
    const params = h.envoyerNotification.mock.calls[0][0];
    expect(params).toMatchObject({ destinataireId: INSTITUTION_DEMANDE, destinataireType: "institution", rdvId: null, type: "changement_profil_examine" });
    expect(String(params.titre)).toContain("Clinique Aurore");
    expect(String(params.message)).toContain("approuvé");
    expect(JSON.stringify(params)).not.toContain("pirate");
  });

  it("a_corriger : le commentaire de l'administrateur est repris dans la notification", async () => {
    await post({ decision: "a_corriger", commentaire: "Merci de joindre le justificatif", statut_vu: "a_examiner" });
    const message = String(h.envoyerNotification.mock.calls[0][0].message);
    expect(message).toContain("n'a pas publié");
    expect(message).toContain("Merci de joindre le justificatif");
  });

  it("aucune notification quand la décision échoue (conflit ou erreur SQL)", async () => {
    etat.rpcReponse = { data: null, error: { message: "decider_changement_profil: cette demande a deja ete traitee entretemps (statut actuel=examinee)" } };
    expect((await post({ decision: "conforme", statut_vu: "a_examiner" })).status).toBe(409);
    etat.rpcReponse = { data: null, error: { code: "XX000", message: "boum" } };
    expect((await post({ decision: "conforme", statut_vu: "a_examiner" })).status).toBe(500);
    expect(h.envoyerNotification).not.toHaveBeenCalled();
  });

  it("un échec d'envoi n'annule pas la décision déjà enregistrée (200, notifie=false)", async () => {
    h.envoyerNotification.mockRejectedValueOnce(new Error("push indisponible"));
    const { status, json } = await post({ decision: "conforme", statut_vu: "a_examiner" });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(json.notifie).toBe(false);
  });

  it("réponse de décision incomplète : pas de notification, décision conservée", async () => {
    etat.rpcReponse = { data: { id: ID, decision: "conforme" }, error: null };
    const { status, json } = await post({ decision: "conforme", statut_vu: "a_examiner" });
    expect(status).toBe(200);
    expect(json.notifie).toBe(false);
    expect(h.envoyerNotification).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/changements-profil/[id]/decision", () => {
  it("exige la permission institutions.verify, refus sans appel SQL", async () => {
    const { AdminAuthError } = await import("@/lib/adminAuth");
    h.authorizeAdmin.mockRejectedValue(new AdminAuthError(403, "FORBIDDEN"));
    const { status } = await post({ decision: "conforme", statut_vu: "a_examiner" });
    expect(status).toBe(403);
    expect(etat.appelsRpc).toHaveLength(0);
    expect(h.authorizeAdmin).toHaveBeenCalledWith(expect.anything(), "institutions.verify");
  });

  it("transmet la décision avec l'administrateur de la SESSION, jamais celui du corps", async () => {
    const { status, json } = await post({ decision: "conforme", statut_vu: "a_examiner", p_examinateur_admin_id: "pirate", admin_id: "pirate" });
    expect(status).toBe(200);
    expect(json.ok).toBe(true);
    expect(etat.appelsRpc).toHaveLength(1);
    expect(etat.appelsRpc[0].nom).toBe("decider_changement_profil");
    expect(etat.appelsRpc[0].args).toEqual({
      p_demande_id: ID, p_decision: "conforme", p_commentaire: null, p_examinateur_admin_id: ADMIN, p_statut_vu: "a_examiner", p_slug: "slug-nouveau-nom",
    });
    expect(JSON.stringify(etat.appelsRpc[0].args)).not.toContain("pirate");
  });

  it("refuse tout ce qui n'est pas conforme / a_corriger, sans appel SQL", async () => {
    for (const decision of ["valide", "refuse", "", null, 1]) {
      expect((await post({ decision, statut_vu: "a_examiner" })).status).toBe(400);
    }
    expect(etat.appelsRpc).toHaveLength(0);
  });

  it("a_corriger exige un commentaire non vide", async () => {
    expect((await post({ decision: "a_corriger", statut_vu: "a_examiner" })).status).toBe(400);
    expect((await post({ decision: "a_corriger", commentaire: "   ", statut_vu: "a_examiner" })).status).toBe(400);
    expect(etat.appelsRpc).toHaveLength(0);
    expect((await post({ decision: "a_corriger", commentaire: "Adresse incomplète", statut_vu: "a_examiner" })).status).toBe(200);
    expect(etat.appelsRpc[0].args.p_commentaire).toBe("Adresse incomplète");
  });

  it("refuse un identifiant non UUID, un statut vu absent et un corps invalide", async () => {
    expect((await post({ decision: "conforme", statut_vu: "a_examiner" }, "pas-un-uuid")).status).toBe(400);
    expect((await post({ decision: "conforme" })).status).toBe(400);
    expect((await post({ decision: "conforme", statut_vu: "a_examiner", commentaire: 12 })).status).toBe(400);
    expect(etat.appelsRpc).toHaveLength(0);
  });

  it("demande déjà traitée → 409 CONFLIT_CONCURRENCE", async () => {
    etat.rpcReponse = { data: null, error: { message: "decider_changement_profil: cette demande a deja ete traitee entretemps (statut actuel=examinee) - rechargez la liste avant de continuer" } };
    const { status, json } = await post({ decision: "conforme", statut_vu: "a_examiner" });
    expect(status).toBe(409);
    expect(json.code).toBe("CONFLIT_CONCURRENCE");
  });

  it("autre erreur SQL → 500 générique sans fuite d'identifiant ni de message interne", async () => {
    etat.rpcReponse = { data: null, error: { code: "P0001", message: "decider_changement_profil: examinateur inconnu ou inactif (admin_id=secret-123)" } };
    const { status, json } = await post({ decision: "conforme", statut_vu: "a_examiner" });
    expect(status).toBe(500);
    expect(JSON.stringify(json)).not.toContain("secret-123");
    expect(JSON.stringify(json)).not.toContain("examinateur");
  });
});

describe("publication différée : slug et effets de la décision", () => {
  it("approbation d'un NOUVEAU NOM : le slug est généré depuis la proposition lue en base (jamais du corps)", async () => {
    await post({ decision: "conforme", statut_vu: "a_examiner", p_slug: "pirate", nouvelle_valeur: "Pirate" });
    expect(etat.appelsRpc[0].args.p_slug).toBe("slug-nouveau-nom");
    expect(JSON.stringify(etat.appelsRpc[0].args)).not.toContain("pirate");
  });

  it("approbation d'un autre champ que le nom : aucun slug", async () => {
    etat.demande = { institution_id: INSTITUTION_DEMANDE, champ: "ville", nouvelle_valeur: "Kindia" };
    await post({ decision: "conforme", statut_vu: "a_examiner" });
    expect(etat.appelsRpc[0].args.p_slug).toBeNull();
  });

  it("refus : aucune lecture de la proposition, aucun slug", async () => {
    await post({ decision: "a_corriger", commentaire: "Document non conforme", statut_vu: "a_examiner" });
    expect(etat.appelsRpc[0].args.p_slug).toBeNull();
  });

  it("la notification d'approbation annonce la publication, celle de refus dit que l'ancienne information reste visible", async () => {
    await post({ decision: "conforme", statut_vu: "a_examiner" });
    expect(String(h.envoyerNotification.mock.calls[0][0].message)).toContain("visible par les citoyens");
    etat.rpcReponse = { data: { id: ID, numero: "YL-CHG-2026-00000001", decision: "a_corriger", institution_id: INSTITUTION_DEMANDE, champ: "name", publiee: false }, error: null };
    await post({ decision: "a_corriger", commentaire: "Justificatif manquant", statut_vu: "a_examiner" });
    const refus = String(h.envoyerNotification.mock.calls[1][0].message);
    expect(refus).toContain("n'a pas publié");
    expect(refus).toContain("Justificatif manquant");
    expect(refus).toContain("continuent de voir l'information précédente");
  });
});
