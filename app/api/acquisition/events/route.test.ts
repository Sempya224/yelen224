import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────
// GAP-17-01 (23/10/2026) — POST /api/acquisition/events, seul point
// d'écriture de acquisition_events. Couvre : institution_id invalide
// (format, inexistante, non validée) refusé, dépassement de débit refusé
// (par IP et par institution), cas valide accepté, citoyen_id jamais
// accepté du client, échec fermé si le compteur est indisponible.
// ─────────────────────────────────────────────────────────────────────────

const { verifierCitoyenToken } = vi.hoisted(() => ({ verifierCitoyenToken: vi.fn() }));
vi.mock("@/lib/citoyenAuth", () => ({ verifierCitoyenToken }));

vi.mock("@/lib/edgeSecurity", async (importOriginal) => {
  const reel = await importOriginal<typeof import("@/lib/edgeSecurity")>();
  return { ...reel, logSecurite: vi.fn() };
});

type Ligne = Record<string, unknown>;

function creerFauxSupabase(seed: { institutions: Ligne[]; rpcEnErreur?: boolean }) {
  const inserts: Ligne[] = [];
  // Simule acquisition_incrementer_compteurs : incrément atomique par clé
  // (une seule fenêtre, celle du test).
  const compteurs = new Map<string, number>();
  return {
    inserts,
    async rpc(nom: string, args: { p_cles: string[] }) {
      if (nom !== "acquisition_incrementer_compteurs") throw new Error(`rpc non simulée: ${nom}`);
      if (seed.rpcEnErreur) return { data: null, error: { message: "function does not exist" } };
      const data = [...new Set(args.p_cles)].map((cle) => {
        const compteur = (compteurs.get(cle) ?? 0) + 1;
        compteurs.set(cle, compteur);
        return { cle, compteur };
      });
      return { data, error: null };
    },
    from(table: string) {
      if (table === "institutions") {
        const filtres: [string, unknown][] = [];
        const builder = {
          select() {
            return builder;
          },
          eq(col: string, val: unknown) {
            filtres.push([col, val]);
            return builder;
          },
          async maybeSingle() {
            const row = seed.institutions.find((r) => filtres.every(([c, v]) => r[c] === v));
            return { data: row ?? null, error: null };
          },
        };
        return builder;
      }
      if (table === "acquisition_events") {
        return {
          async insert(row: Ligne) {
            inserts.push(row);
            return { data: null, error: null };
          },
        };
      }
      throw new Error(`table non simulée: ${table}`);
    },
  };
}

let fauxSupabaseCourant: ReturnType<typeof creerFauxSupabase>;
vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => fauxSupabaseCourant),
}));

const INSTITUTION_VALIDEE = "3f2c6a1e-8b4d-4c2a-9e1f-0a1b2c3d4e5f";
const INSTITUTION_SUSPENDUE = "7b9e2d40-1c3a-4f5b-8a6d-2e4f6a8b0c1d";
const INSTITUTION_EN_ATTENTE = "5d1a7c3e-9f2b-4e6d-a8c0-1b3d5f7a9c2e";
const INSTITUTION_INEXISTANTE = "c0ffee00-0000-4000-8000-000000000001";
const VISITEUR_ID = "9a8b7c6d-5e4f-4a3b-9c2d-1e0f2a3b4c5d";
const CITOYEN_ID = "44444444-4444-4444-8444-444444444444";

function evenement(overrides: Ligne = {}): Ligne {
  return {
    institution_id: INSTITUTION_VALIDEE,
    event_type: "profile_view",
    source: "yelen_search",
    visiteur_id: VISITEUR_ID,
    ...overrides,
  };
}

function requete(body: unknown, opts: { ip?: string; token?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-nf-client-connection-ip": opts.ip ?? "203.0.113.10" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  return new NextRequest("http://localhost/api/acquisition/events", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function importRoute() {
  return await import("./route");
}

// Préchauffage : sorti du délai de 5 s du premier test (même cause que
// app/api/checkin/scan/route.test.ts, "Test timed out" sous charge).
beforeAll(async () => {
  await importRoute();
}, 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  // route.ts crée son client Supabase au chargement du module : reset pour
  // que chaque test voie sa propre fausse base (même pattern que
  // app/api/qr/validate/route.test.ts).
  vi.resetModules();
  verifierCitoyenToken.mockResolvedValue(null);
  fauxSupabaseCourant = creerFauxSupabase({
    institutions: [
      { id: INSTITUTION_VALIDEE, statut: "validee" },
      { id: INSTITUTION_SUSPENDUE, statut: "suspendue" },
      { id: INSTITUTION_EN_ATTENTE, statut: "en_attente" },
    ],
  });
});

describe("POST /api/acquisition/events — cas valide", () => {
  it("1. événement valide, visiteur anonyme -> 204, insert service_role avec citoyen_id null", async () => {
    const { POST } = await importRoute();
    const res = await POST(requete(evenement()));
    expect(res.status).toBe(204);
    expect(fauxSupabaseCourant.inserts).toEqual([
      { institution_id: INSTITUTION_VALIDEE, event_type: "profile_view", source: "yelen_search", citoyen_id: null, visiteur_id: VISITEUR_ID },
    ]);
  });

  it("2. jeton citoyen valide -> citoyen_id dérivé du jeton vérifié côté serveur", async () => {
    verifierCitoyenToken.mockResolvedValue({ id: CITOYEN_ID });
    const { POST } = await importRoute();
    const res = await POST(requete(evenement({ event_type: "appointment_started", source: "qr_code" }), { token: "jeton-valide" }));
    expect(res.status).toBe(204);
    expect(verifierCitoyenToken).toHaveBeenCalledWith("jeton-valide");
    expect(fauxSupabaseCourant.inserts[0].citoyen_id).toBe(CITOYEN_ID);
  });

  it("3. jeton invalide -> traité comme visiteur anonyme, jamais un refus", async () => {
    const { POST } = await importRoute();
    const res = await POST(requete(evenement(), { token: "jeton-forge" }));
    expect(res.status).toBe(204);
    expect(fauxSupabaseCourant.inserts[0].citoyen_id).toBeNull();
  });

  it("4. visiteur_id absent (localStorage indisponible) -> accepté, visiteur_id null", async () => {
    const { POST } = await importRoute();
    const res = await POST(requete(evenement({ visiteur_id: null })));
    expect(res.status).toBe(204);
    expect(fauxSupabaseCourant.inserts[0].visiteur_id).toBeNull();
  });
});

describe("POST /api/acquisition/events — institution_id invalide refusé", () => {
  it.each([
    ["inexistante", INSTITUTION_INEXISTANTE],
    ["suspendue", INSTITUTION_SUSPENDUE],
    ["en_attente (non publique)", INSTITUTION_EN_ATTENTE],
  ])("5. institution %s -> 404 générique, aucun insert", async (_cas, id) => {
    const { POST } = await importRoute();
    const res = await POST(requete(evenement({ institution_id: id })));
    const body = await res.json();
    expect(res.status).toBe(404);
    expect(body.code).toBe("INSTITUTION_INCONNUE");
    expect(fauxSupabaseCourant.inserts).toHaveLength(0);
  });

  it("6. institution_id au format non UUID -> 400, aucune lecture ni insert", async () => {
    const { POST } = await importRoute();
    const res = await POST(requete(evenement({ institution_id: "1 OR 1=1" })));
    expect(res.status).toBe(400);
    expect(fauxSupabaseCourant.inserts).toHaveLength(0);
  });
});

describe("POST /api/acquisition/events — validation du payload", () => {
  it.each([
    ["event_type inconnu", { event_type: "fake_conversion" }],
    ["source inconnue", { source: "google_ads" }],
    ["visiteur_id non UUID", { visiteur_id: "x".repeat(500) }],
    ["citoyen_id fourni par le client (usurpation)", { citoyen_id: CITOYEN_ID }],
    ["champ inconnu", { created_at: "2020-01-01T00:00:00Z" }],
  ])("7. %s -> 400, aucun insert", async (_cas, overrides) => {
    const { POST } = await importRoute();
    const res = await POST(requete(evenement(overrides)));
    expect(res.status).toBe(400);
    expect(fauxSupabaseCourant.inserts).toHaveLength(0);
  });

  it("8. corps non JSON -> 400", async () => {
    const { POST } = await importRoute();
    const res = await POST(requete("pas du json"));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/acquisition/events — dépassement de débit refusé", () => {
  it("9. même IP : 30 événements/min acceptés, le 31e -> 429 avec Retry-After, non inséré", async () => {
    const { POST } = await importRoute();
    for (let i = 0; i < 30; i++) {
      const res = await POST(requete(evenement(), { ip: "198.51.100.7" }));
      expect(res.status).toBe(204);
    }
    const res = await POST(requete(evenement(), { ip: "198.51.100.7" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect((await res.json()).code).toBe("RATE_LIMITED");
    expect(fauxSupabaseCourant.inserts).toHaveLength(30);
  });

  it("10. limite IP indépendante : une autre IP n'est pas bloquée par la première", async () => {
    const { POST } = await importRoute();
    for (let i = 0; i < 31; i++) await POST(requete(evenement(), { ip: "198.51.100.7" }));
    const res = await POST(requete(evenement(), { ip: "198.51.100.8" }));
    expect(res.status).toBe(204);
  });

  it("11. même institution depuis des IP différentes : 300/min acceptés, le 301e -> 429", async () => {
    const { POST } = await importRoute();
    for (let i = 0; i < 300; i++) {
      const res = await POST(requete(evenement(), { ip: `10.0.${Math.floor(i / 250)}.${i % 250}` }));
      expect(res.status).toBe(204);
    }
    const res = await POST(requete(evenement(), { ip: "192.0.2.99" }));
    expect(res.status).toBe(429);
    expect(fauxSupabaseCourant.inserts).toHaveLength(300);
  });

  it("12. compteur indisponible (migration non appliquée, panne) -> 503 fail-closed, aucun insert", async () => {
    fauxSupabaseCourant = creerFauxSupabase({ institutions: [{ id: INSTITUTION_VALIDEE, statut: "validee" }], rpcEnErreur: true });
    const { POST } = await importRoute();
    const res = await POST(requete(evenement()));
    expect(res.status).toBe(503);
    expect(fauxSupabaseCourant.inserts).toHaveLength(0);
  });
});
