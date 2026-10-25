import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Lot 1a (API Services) — validation, erreurs génériques, journalisation,
// promo ignorée, est_chambre immuable. Données fictives. Le faux Supabase
// n'implémente que ce que la route utilise ; `erreurs` injecte une erreur
// base brute (message technique) pour vérifier qu'elle ne fuit jamais.

type Ligne = Record<string, unknown>;

const INSTITUTION = "i0000000-0000-0000-0000-000000000001";
const AUTRE_INSTITUTION = "i0000000-0000-0000-0000-000000000002";
const MESSAGE_TECHNIQUE = 'duplicate key value violates unique constraint "paid_services_pkey"';

const mocks = vi.hoisted(() => ({
  membre: { institutionId: "i0000000-0000-0000-0000-000000000001", membreId: "membre-1", role: "admin" } as { institutionId: string; membreId: string; role: string },
  authentifie: true,
  enregistrerAction: vi.fn<(p: Record<string, unknown>) => Promise<void>>(async () => {}),
}));

vi.mock("@/lib/institutionAuth", () => ({ getAuthenticatedMembre: vi.fn(async () => (mocks.authentifie ? mocks.membre : null)) }));
vi.mock("@/lib/journalActivite", () => ({ enregistrerAction: mocks.enregistrerAction, getMembreNomPourJournal: vi.fn(async () => "Membre Test") }));
vi.mock("@/lib/hotelEquipements", () => ({ CODES_EQUIPEMENTS_CHAMBRE: ["wifi", "clim"] }));

let tables: Record<string, Ligne[]>;
let erreurs: Record<string, { message: string; code?: string }>;
let compteur = 0;

function creerFaux() {
  return {
    from(table: string) {
      const predicats: ((r: Ligne) => boolean)[] = [];
      let op: "select" | "insert" | "update" | "delete" = "select";
      let payload: Ligne = {};
      function executer(): { data: Ligne[] | null; error: { message: string; code?: string } | null } {
        const cle = `${table}:${op}`;
        if (erreurs[cle]) return { data: null, error: erreurs[cle] };
        if (op === "insert") {
          const row: Ligne = { id: `nouveau-${++compteur}`, created_at: "2026-10-25T00:00:00Z", prix_promo: null, promo_actif: false, ...payload };
          tables[table].push(row);
          return { data: [row], error: null };
        }
        const rows = tables[table].filter((r) => predicats.every((p) => p(r)));
        if (op === "update") { rows.forEach((r) => Object.assign(r, payload)); return { data: rows, error: null }; }
        if (op === "delete") { tables[table] = tables[table].filter((r) => !rows.includes(r)); return { data: rows, error: null }; }
        return { data: rows, error: null };
      }
      const builder = {
        select() { return builder; },
        insert(p: Ligne) { op = "insert"; payload = p; return builder; },
        update(p: Ligne) { op = "update"; payload = p; return builder; },
        delete() { op = "delete"; return builder; },
        eq(col: string, val: unknown) { predicats.push((r) => r[col] === val); return builder; },
        in(col: string, vals: unknown[]) { predicats.push((r) => vals.includes(r[col])); return builder; },
        order() { return builder; },
        // Copies (comme PostgREST) : l'état lu avant une mise à jour ne doit pas être muté par elle.
        async maybeSingle() { const r = executer(); return { data: r.data?.[0] ? { ...r.data[0] } : null, error: r.error }; },
        async single() { const r = executer(); return r.error ? { data: null, error: r.error } : { data: r.data?.[0] ? { ...r.data[0] } : null, error: null }; },
        then(onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) { return Promise.resolve(executer()).then(onOk, onErr); },
      };
      return builder;
    },
  };
}

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => fauxCourant) }));
let fauxCourant: ReturnType<typeof creerFaux>;

const requete = (methode: string, corps?: unknown, query = "") =>
  new NextRequest(`http://localhost/api/institution/services${query}`, { method: methode, body: corps === undefined ? undefined : JSON.stringify(corps) });
async function importRoute() { return await import("./route"); }
const service = (id: string, extra: Ligne = {}): Ligne => ({
  id, institution_id: INSTITUTION, nom: "Consultation", prix: 5000, duree_minutes: 30, is_active: true, est_chambre: false, ...extra,
});
const VALIDE = { nom: "Massage", prix: 15000, duree_minutes: 45 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
  compteur = 0;
  mocks.authentifie = true;
  mocks.membre.role = "admin";
  erreurs = {};
  tables = { paid_services: [service("S1"), service("S2", { institution_id: AUTRE_INSTITUTION })], paid_bookings: [], users: [] };
  fauxCourant = creerFaux();
});

describe("POST — création", () => {
  it("crée le service, journalise service_cree (non bloquant)", async () => {
    const { POST } = await importRoute();
    const res = await POST(requete("POST", VALIDE));
    expect(res.status).toBe(200);
    expect(tables.paid_services).toHaveLength(3);
    expect(tables.paid_services[2]).toMatchObject({ institution_id: INSTITUTION, nom: "Massage", prix: 15000, is_active: true, est_chambre: false });
    expect(mocks.enregistrerAction).toHaveBeenCalledTimes(1);
    expect(mocks.enregistrerAction.mock.calls[0][0]).toMatchObject({ action: "service_cree", cibleTable: "paid_services", institutionId: INSTITUTION, membreId: "membre-1" });
  });

  it("un échec du journal n'empêche pas la création", async () => {
    mocks.enregistrerAction.mockRejectedValueOnce(new Error("journal HS"));
    const { POST } = await importRoute();
    const res = await POST(requete("POST", VALIDE));
    expect(res.status).toBe(200);
  });

  it("promo ignorée : prix_promo / promo_actif jamais transmis à l'insertion", async () => {
    const { POST } = await importRoute();
    await POST(requete("POST", { ...VALIDE, prix_promo: 1000, promo_actif: true }));
    const cree = tables.paid_services[2];
    expect(cree.prix_promo).toBeNull();
    expect(cree.promo_actif).toBe(false);
  });

  it("valeurs invalides : 400 avec code stable, rien inséré, rien journalisé", async () => {
    const { POST } = await importRoute();
    const cas: [Ligne, string][] = [
      [{ ...VALIDE, prix: 0 }, "PRIX_INVALIDE"],
      [{ ...VALIDE, prix: 100_000_001 }, "PRIX_INVALIDE"],
      [{ ...VALIDE, prix: 10.5 }, "PRIX_INVALIDE"],
      [{ ...VALIDE, duree_minutes: 1441 }, "DUREE_INVALIDE"],
      [{ ...VALIDE, nom: "" }, "NOM_INVALIDE"],
      [{ ...VALIDE, nom: "x".repeat(121) }, "NOM_INVALIDE"],
      [{ ...VALIDE, description: "x".repeat(2001) }, "DESCRIPTION_TROP_LONGUE"],
      [{ ...VALIDE, taux_taxe: 101 }, "TAXE_INVALIDE"],
      [{ ...VALIDE, categorie: "x".repeat(81) }, "CATEGORIE_INVALIDE"],
    ];
    for (const [corps, code] of cas) {
      const res = await POST(requete("POST", corps));
      const j = await res.json();
      expect(res.status).toBe(400);
      expect(j.code).toBe(code);
      expect(typeof j.error).toBe("string");
    }
    expect(tables.paid_services).toHaveLength(2);
    expect(mocks.enregistrerAction).not.toHaveBeenCalled();
  });

  it("erreur base : message générique + ERREUR_SERVEUR, jamais le message technique", async () => {
    erreurs["paid_services:insert"] = { message: MESSAGE_TECHNIQUE, code: "23505" };
    const { POST } = await importRoute();
    const res = await POST(requete("POST", VALIDE));
    const texte = JSON.stringify(await res.json());
    expect(res.status).toBe(500);
    expect(texte).toContain("ERREUR_SERVEUR");
    expect(texte).not.toContain("duplicate key");
    expect(texte).not.toContain("paid_services_pkey");
    expect(mocks.enregistrerAction).not.toHaveBeenCalled();
  });

  it("non authentifié : 401 ; rôle sans services.write : 403 (codes stables)", async () => {
    const { POST } = await importRoute();
    mocks.authentifie = false;
    const non = await POST(requete("POST", VALIDE));
    expect(non.status).toBe(401);
    expect((await non.json()).code).toBe("NON_AUTHENTIFIE");
    mocks.authentifie = true;
    mocks.membre.role = "agent";
    const refuse = await POST(requete("POST", VALIDE));
    expect(refuse.status).toBe(403);
    expect((await refuse.json()).code).toBe("ACCES_REFUSE");
  });
});

describe("PATCH — modification", () => {
  it("changement de prix : service_prix_modifie avec ancien et nouveau prix", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(requete("PATCH", { id: "S1", prix: 7000 }));
    expect(res.status).toBe(200);
    expect(tables.paid_services[0].prix).toBe(7000);
    expect(mocks.enregistrerAction).toHaveBeenCalledTimes(1);
    expect(mocks.enregistrerAction.mock.calls[0][0]).toMatchObject({
      action: "service_prix_modifie", cibleId: "S1", ancienneValeur: { prix: 5000 }, nouvelleValeur: { prix: 7000 },
    });
  });

  it("prix identique ou autre champ modifié : aucune entrée de journal", async () => {
    const { PATCH } = await importRoute();
    await PATCH(requete("PATCH", { id: "S1", prix: 5000, nom: "Consultation générale" }));
    expect(mocks.enregistrerAction).not.toHaveBeenCalled();
  });

  it("suspension puis réactivation : service_suspendu puis service_reactive ; pas de journal si inchangé", async () => {
    const { PATCH } = await importRoute();
    await PATCH(requete("PATCH", { id: "S1", is_active: false }));
    await PATCH(requete("PATCH", { id: "S1", is_active: false }));
    await PATCH(requete("PATCH", { id: "S1", is_active: true }));
    expect(mocks.enregistrerAction.mock.calls.map((c) => c[0].action)).toEqual(["service_suspendu", "service_reactive"]);
  });

  it("est_chambre immuable : ignoré, la valeur en base ne change pas", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(requete("PATCH", { id: "S1", est_chambre: true, nom: "Autre nom" }));
    expect(res.status).toBe(200);
    expect(tables.paid_services[0].est_chambre).toBe(false);
    expect(tables.paid_services[0].nom).toBe("Autre nom");
  });

  it("promo ignorée en modification ; corps sans champ reconnu : 400 CORPS_VIDE", async () => {
    const { PATCH } = await importRoute();
    const seul = await PATCH(requete("PATCH", { id: "S1", prix_promo: 100, promo_actif: true }));
    expect(seul.status).toBe(400);
    expect((await seul.json()).code).toBe("CORPS_VIDE");
    expect(tables.paid_services[0].promo_actif).toBeUndefined();
  });

  it("valeurs invalides : 400 avec code, base intacte", async () => {
    const { PATCH } = await importRoute();
    const cas: [Ligne, string][] = [
      [{ prix: -1 }, "PRIX_INVALIDE"], [{ prix: 0 }, "PRIX_INVALIDE"], [{ duree_minutes: 0 }, "DUREE_INVALIDE"],
      [{ taux_taxe: 120 }, "TAXE_INVALIDE"], [{ nombre_unites: 0 }, "NOMBRE_UNITES_INVALIDE"],
      [{ capacite_max: -1 }, "CAPACITE_INVALIDE"], [{ superficie_m2: 0 }, "SUPERFICIE_INVALIDE"],
    ];
    for (const [corps, code] of cas) {
      const res = await PATCH(requete("PATCH", { id: "S1", ...corps }));
      expect(res.status).toBe(400);
      expect((await res.json()).code).toBe(code);
    }
    expect(tables.paid_services[0]).toMatchObject({ prix: 5000, duree_minutes: 30 });
  });

  it("service d'une autre institution ou inexistant : 404 SERVICE_INTROUVABLE", async () => {
    const { PATCH } = await importRoute();
    for (const id of ["S2", "absent"]) {
      const res = await PATCH(requete("PATCH", { id, prix: 100 }));
      expect(res.status).toBe(404);
      expect((await res.json()).code).toBe("SERVICE_INTROUVABLE");
    }
  });

  it("vraie erreur serveur à la lecture de la cible : 500 ERREUR_SERVEUR, pas un 404", async () => {
    erreurs["paid_services:select"] = { message: 'column "nom_inconnu" does not exist', code: "42703" };
    const { PATCH } = await importRoute();
    const res = await PATCH(requete("PATCH", { id: "S1", prix: 100 }));
    const texte = JSON.stringify(await res.json());
    expect(res.status).toBe(500);
    expect(texte).toContain("ERREUR_SERVEUR");
    expect(texte).not.toContain("nom_inconnu");
  });

  it("erreur à la mise à jour : message générique", async () => {
    erreurs["paid_services:update"] = { message: MESSAGE_TECHNIQUE };
    const { PATCH } = await importRoute();
    const res = await PATCH(requete("PATCH", { id: "S1", prix: 100 }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("duplicate key");
  });
});

describe("DELETE", () => {
  it("supprime et journalise service_supprime avec l'état d'avant", async () => {
    const { DELETE } = await importRoute();
    const res = await DELETE(requete("DELETE", undefined, "?id=S1"));
    expect(res.status).toBe(200);
    expect(tables.paid_services.find((s) => s.id === "S1")).toBeUndefined();
    expect(mocks.enregistrerAction.mock.calls[0][0]).toMatchObject({ action: "service_supprime", cibleId: "S1", ancienneValeur: { prix: 5000, is_active: true } });
  });

  it("autre institution : 404, rien supprimé ni journalisé", async () => {
    const { DELETE } = await importRoute();
    const res = await DELETE(requete("DELETE", undefined, "?id=S2"));
    expect(res.status).toBe(404);
    expect(tables.paid_services).toHaveLength(2);
    expect(mocks.enregistrerAction).not.toHaveBeenCalled();
  });

  it("clé étrangère (reçu/paiement lié) : 409 SERVICE_NON_SUPPRIMABLE, sans message technique", async () => {
    erreurs["paid_services:delete"] = { message: 'update or delete on table "paid_bookings" violates foreign key constraint "recus_paid_booking_id_fkey"', code: "23503" };
    const { DELETE } = await importRoute();
    const res = await DELETE(requete("DELETE", undefined, "?id=S1"));
    const j = await res.json();
    expect(res.status).toBe(409);
    expect(j.code).toBe("SERVICE_NON_SUPPRIMABLE");
    expect(JSON.stringify(j)).not.toContain("recus_paid_booking_id_fkey");
    expect(mocks.enregistrerAction).not.toHaveBeenCalled();
  });

  it("autre erreur base : 500 générique", async () => {
    erreurs["paid_services:delete"] = { message: "connection reset by peer" };
    const { DELETE } = await importRoute();
    const res = await DELETE(requete("DELETE", undefined, "?id=S1"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("connection reset");
  });
});

describe("GET", () => {
  it("erreur base : message générique", async () => {
    erreurs["paid_services:select"] = { message: "permission denied for table paid_services" };
    const { GET } = await importRoute();
    const res = await GET(requete("GET"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("permission denied");
  });

  it("liste les services de l'institution seulement", async () => {
    const { GET } = await importRoute();
    const res = await GET(requete("GET"));
    const j = await res.json();
    expect(j.services.map((s: Ligne) => s.id)).toEqual(["S1"]);
  });
});
