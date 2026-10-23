import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ─────────────────────────────────────────────────────────────────────────
// Mission A (22/10/2026) — sécurisation de la validation des paiements.
// Couvre : ciblage du RDV lié (rdv_id, repli code + citoyen + institution,
// jamais le créneau), garde de statut + concurrence, annulation d'une
// réservation payée, refus d'une revalidation avec reçu archivé, et
// transmission de accesRestreints sur « annuler la validation ».
// Les données sont fictives. Le faux Supabase évalue chaque écriture de façon
// atomique (comme la base) : un update gardé sur le statut ne touche aucune
// ligne si un autre appel est passé avant.
// ─────────────────────────────────────────────────────────────────────────

type Ligne = Record<string, unknown>;

const INSTITUTION = "i0000000-0000-0000-0000-000000000001";
const CITOYEN_1 = "c0000000-0000-0000-0000-000000000001";
const CITOYEN_2 = "c0000000-0000-0000-0000-000000000002";
const SERVICE = "s0000000-0000-0000-0000-000000000001";
const CRENEAU = { date_rdv: "2026-08-06", heure_rdv: "01:40:00" };

const mocks = vi.hoisted(() => ({
  membre: { institutionId: "i0000000-0000-0000-0000-000000000001", membreId: "membre-1", role: "agent", accesRestreints: [] as string[] },
  suspendu: false,
  enregistrerAction: vi.fn(async () => {}),
  enregistrerTransaction: vi.fn(async () => "trx-1" as string | null),
  notifierArrivee: vi.fn(async () => {}),
  notifierPriseEnCharge: vi.fn(async () => {}),
  envoyerNotification: vi.fn(async () => {}),
  chargerRestrictionActive: vi.fn(async () => null),
  notifierSiEscalade: vi.fn(async () => {}),
}));

vi.mock("@/lib/institutionAuth", () => ({ getAuthenticatedMembre: vi.fn(async () => mocks.membre) }));
vi.mock("@/lib/journalActivite", () => ({ enregistrerAction: mocks.enregistrerAction, getMembreNomPourJournal: vi.fn(async () => "Agent Test") }));
vi.mock("@/lib/transactionsFinancieres", () => ({ enregistrerTransaction: mocks.enregistrerTransaction }));
vi.mock("@/lib/notificationEngine", () => ({
  notifierArrivee: mocks.notifierArrivee, notifierPriseEnCharge: mocks.notifierPriseEnCharge, envoyerNotification: mocks.envoyerNotification,
  formatDateLongue: vi.fn(() => "6 août 2026"), formatHeureCourte: vi.fn(() => "1:40 AM"), salutation: vi.fn(() => "Bonjour"),
}));
vi.mock("@/lib/rdvRestrictions", () => ({ chargerRestrictionActive: mocks.chargerRestrictionActive, notifierSiEscalade: mocks.notifierSiEscalade }));
vi.mock("@/lib/activiteInstitution", () => ({ toucherActiviteInstitution: vi.fn(async () => {}) }));
vi.mock("@/lib/recuPdf", () => ({ chargerDonneesRecu: vi.fn(async () => null), genererRecuPdf: vi.fn() }));
vi.mock("@/lib/bookingAccess", () => ({ getBookingAccess: vi.fn(async () => ({ etat: "CAN_BOOK", pause: null })), bloqueTraitementExistant: vi.fn(() => mocks.suspendu) }));
vi.mock("@/lib/rdvGating", async (importOriginal) => {
  const reel = await importOriginal<typeof import("@/lib/rdvGating")>();
  return {
    ...reel,
    creneauEstOuvert: vi.fn(() => true), absenceDeclarable: vi.fn(() => true),
    depasseFenetreGraceNonTraite: vi.fn(() => false), calculerCheckInStatus: vi.fn(() => "CHECK_IN_AVAILABLE"),
  };
});

// ── Faux Supabase ────────────────────────────────────────────────────────
let tables: Record<string, Ligne[]>;
let ecrituresRdv: { id: unknown; updates: Ligne }[];
let compteurId = 0;
// Simule « un autre agent a gagné entre la lecture et l'écriture » : appelé juste
// avant chaque update, pour vérifier le garde atomique indépendamment du
// contrôle de statut fait à la lecture.
let avantUpdate: ((table: string) => void) | null = null;
// Tarif courant du service (modifiable par un test pour simuler un changement de prix).
let prixService = 2000;
// Tables simulées comme « inexistantes » (migration non appliquée).
const tablesAbsentes = new Set<string>();

function joindre(table: string, row: Ligne): Ligne {
  if (table !== "paid_bookings") return row;
  const user = tables.users.find((u) => u.id === row.citoyen_id) ?? null;
  return {
    ...row,
    paid_services: { nom: "Transfert d'argent", prix: prixService, duree_minutes: 30 },
    institutions: { name: "Banque Test" },
    users: user,
  };
}

function creerFauxSupabase() {
  return {
    from(table: string) {
      if (tablesAbsentes.has(table)) {
        // Table inexistante en base (migration non appliquée) : chaque requête renvoie une erreur.
        const erreur = { data: null, error: { message: `relation "${table}" does not exist` } };
        const absent: Record<string, unknown> = {};
        for (const m of ["select", "insert", "update", "eq", "gte", "limit", "in", "not", "maybeSingle"]) absent[m] = () => absent;
        absent.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) => Promise.resolve(erreur).then(onOk, onErr);
        return absent as never;
      }
      if (!(table in tables)) throw new Error(`table non simulée: ${table}`);
      const predicats: ((r: Ligne) => boolean)[] = [];
      let op: "select" | "update" | "insert" = "select";
      let payload: Ligne = {};
      let limite: number | null = null;
      let renvoyer = false;

      function executer(): { data: unknown; error: unknown } {
        if (op === "insert") {
          const row: Ligne = { id: `nouveau-${++compteurId}`, tentee_le: new Date().toISOString(), ...payload };
          tables[table].push(row);
          return { data: renvoyer ? row : null, error: null };
        }
        if (op === "update") avantUpdate?.(table);
        let rows = tables[table].filter((r) => predicats.every((p) => p(r)));
        if (op === "update") {
          rows.forEach((r) => Object.assign(r, payload));
          if (table === "rdv") rows.forEach((r) => ecrituresRdv.push({ id: r.id, updates: payload }));
          return { data: renvoyer ? rows.map((r) => ({ id: r.id })) : null, error: null };
        }
        if (limite !== null) rows = rows.slice(0, limite);
        return { data: rows.map((r) => joindre(table, r)), error: null };
      }

      const builder = {
        select() { if (op !== "select") renvoyer = true; return builder; },
        update(p: Ligne) { op = "update"; payload = p; return builder; },
        insert(p: Ligne) { op = "insert"; payload = p; return builder; },
        eq(col: string, val: unknown) { predicats.push((r) => r[col] === val); return builder; },
        gte(col: string, val: string) { predicats.push((r) => String(r[col]) >= val); return builder; },
        not(col: string) { predicats.push((r) => r[col] != null); return builder; },
        limit(n: number) { limite = n; return builder; },
        async maybeSingle() {
          const res = executer(); const rows = res.data as Ligne[];
          if (rows.length > 1) return { data: null, error: { message: "multiple rows" } };
          return { data: rows[0] ?? null, error: null };
        },
        async single() {
          const res = executer();
          if (op === "insert") return res;
          const rows = res.data as Ligne[];
          return rows.length === 1 ? { data: rows[0], error: null } : { data: null, error: { message: "no rows" } };
        },
        then(onOk: (v: { data: unknown; error: unknown }) => unknown, onErr?: (e: unknown) => unknown) {
          return Promise.resolve(executer()).then(onOk, onErr);
        },
      };
      return builder;
    },
    storage: { from: () => ({ upload: vi.fn(async () => ({ error: null })) }) },
  };
}

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => fauxCourant) }));
let fauxCourant: ReturnType<typeof creerFauxSupabase>;

// ── Jeu de données : DEUX réservations sur le MÊME créneau, deux citoyens ─
function reservation(id: string, citoyen: string, code: string, rdvId: string | null, extra: Ligne = {}): Ligne {
  return {
    id, institution_id: INSTITUTION, citoyen_id: citoyen, service_id: SERVICE, ...CRENEAU, confirmation_code: code,
    statut: "en_attente", montant_paye: 2000, montant_declare_citoyen: 2000, declare_le: "2026-08-06T01:00:00Z", traite_le: null, rdv_id: rdvId, ...extra,
  };
}
function rdv(id: string, citoyen: string, code: string | null): Ligne {
  return { id, institution_id: INSTITUTION, citoyen_id: citoyen, ...CRENEAU, qr_token: code, statut: "nouveau", presence_status: null, pour_autre: false, nom_autre: null, phone_autre: null };
}

function patch(body: Ligne) {
  return new NextRequest("http://localhost/api/institution/paid-bookings/valider", { method: "PATCH", body: JSON.stringify(body) });
}
function get(query: string) {
  return new NextRequest(`http://localhost/api/institution/paid-bookings/valider?${query}`);
}
async function importRoute() { return await import("./route"); }
const rdvParId = (id: string) => tables.rdv.find((r) => r.id === id)!;
const bookingParId = (id: string) => tables.paid_bookings.find((r) => r.id === id)!;

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  compteurId = 0;
  ecrituresRdv = [];
  avantUpdate = null;
  prixService = 2000;
  tablesAbsentes.clear();
  mocks.membre.membreId = "membre-1";
  mocks.membre.role = "agent";
  mocks.membre.accesRestreints = [];
  mocks.suspendu = false;
  mocks.enregistrerTransaction.mockResolvedValue("trx-1");
  tables = {
    users: [
      { id: CITOYEN_1, prenom: "Aïssatou", nom: "Test", phone: "+224600000001", photo_url: null, date_naissance: null, sexe: null },
      { id: CITOYEN_2, prenom: "Moussa", nom: "Exemple", phone: "+224600000002", photo_url: null, date_naissance: null, sexe: null },
    ],
    paid_bookings: [reservation("B1", CITOYEN_1, "111111", "R1"), reservation("B2", CITOYEN_2, "222222", "R2")],
    rdv: [rdv("R1", CITOYEN_1, "111111"), rdv("R2", CITOYEN_2, "222222")],
    recus: [],
    validation_code_tentatives: [],
  };
  fauxCourant = creerFauxSupabase();
});

describe("ciblage du RDV lié — deux réservations sur le même créneau", () => {
  it("valider B1 modifie R1 seulement, jamais R2", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "confirme" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rdv_lie).toBe(true);
    expect(rdvParId("R1")).toMatchObject({ statut: "confirme", presence_status: "present" });
    expect(rdvParId("R2")).toMatchObject({ statut: "nouveau", presence_status: null });
    expect(ecrituresRdv.map((e) => e.id)).toEqual(["R1"]);
  });

  it("marquer B1 absent : R2 intact, aucune restriction évaluée pour l'autre citoyen", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "no_show", motif: "ne s'est pas présenté" }));
    expect(res.status).toBe(200);
    expect(rdvParId("R1").presence_status).toBe("absent");
    expect(rdvParId("R2").presence_status).toBeNull();
    expect(mocks.chargerRestrictionActive).toHaveBeenCalledTimes(1);
    expect(mocks.chargerRestrictionActive).toHaveBeenCalledWith(expect.anything(), CITOYEN_1);
    expect(mocks.notifierSiEscalade).toHaveBeenCalledTimes(1);
    expect(mocks.notifierSiEscalade).toHaveBeenCalledWith(expect.anything(), CITOYEN_1, null);
  });

  it("annuler B2 modifie R2 seulement", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B2", action: "annule", motif: "demande du citoyen" }));
    expect(res.status).toBe(200);
    expect(rdvParId("R2")).toMatchObject({ statut: "annule", annule_par: "institution" });
    expect(rdvParId("R1")).toMatchObject({ statut: "nouveau" });
  });

  it("aucun update de rdv n'est jamais filtré par date et heure : écritures toujours par id", async () => {
    const { PATCH } = await importRoute();
    await PATCH(patch({ id: "B1", action: "confirme" }));
    await PATCH(patch({ id: "B2", action: "no_show", motif: "absent au guichet" }));
    expect(ecrituresRdv.map((e) => e.id)).toEqual(["R1", "R2"]);
  });

  it("repli : rdv_id vide, un seul RDV correspond au code + citoyen + institution -> ciblé", async () => {
    bookingParId("B1").rdv_id = null;
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "confirme" }));
    const body = await res.json();
    expect(body.rdv_lie).toBe(true);
    expect(rdvParId("R1").statut).toBe("confirme");
    expect(rdvParId("R2").statut).toBe("nouveau");
  });

  it("rdv_id vide et deux RDV pour ce code : aucune écriture dans rdv, rdv_lie false, réservation traitée", async () => {
    bookingParId("B1").rdv_id = null;
    tables.rdv.push(rdv("R1bis", CITOYEN_1, "111111"));
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "confirme" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rdv_lie).toBe(false);
    expect(ecrituresRdv).toHaveLength(0);
    expect(bookingParId("B1").statut).toBe("confirme");
    expect(mocks.notifierArrivee).not.toHaveBeenCalled();
  });

  it("aucun RDV lié du tout : rdv_lie false, aucune écriture rdv, aucune restriction", async () => {
    tables.paid_bookings.push(reservation("B3", CITOYEN_1, "333333", null, { date_rdv: "2026-08-07" }));
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B3", action: "no_show", motif: "pas venu du tout" }));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.rdv_lie).toBe(false);
    expect(ecrituresRdv).toHaveLength(0);
    expect(mocks.chargerRestrictionActive).not.toHaveBeenCalled();
    expect(mocks.notifierSiEscalade).not.toHaveBeenCalled();
  });

  it("GET : rdv_lie true pour une réservation liée, false sinon ; le tiers vient du RDV lié seulement", async () => {
    rdvParId("R1").pour_autre = true;
    rdvParId("R1").nom_autre = "Fatoumata Exemple";
    rdvParId("R2").pour_autre = true;
    rdvParId("R2").nom_autre = "Autre Personne";
    tables.paid_bookings.push(reservation("B3", CITOYEN_1, "333333", null));
    const { GET } = await importRoute();
    const lie = await (await GET(get("id=B1"))).json();
    expect(lie.booking.rdv_lie).toBe(true);
    expect(lie.booking.nom_autre).toBe("Fatoumata Exemple");
    const nonLie = await (await GET(get("id=B3"))).json();
    expect(nonLie.booking.rdv_lie).toBe(false);
    expect(nonLie.booking.pour_autre).toBe(false);
    expect(nonLie.booking.nom_autre).toBeNull();
  });
});

describe("garde de statut et concurrence", () => {
  it("double envoi : le second reçoit 409 avec le statut actuel, un seul encaissement", async () => {
    const { PATCH } = await importRoute();
    const premier = await PATCH(patch({ id: "B1", action: "confirme" }));
    const second = await PATCH(patch({ id: "B1", action: "confirme" }));
    const corps = await second.json();
    expect(premier.status).toBe(200);
    expect(second.status).toBe(409);
    expect(corps.code).toBe("DEJA_TRAITEE");
    expect(corps.statut_actuel).toBe("confirme");
    expect(mocks.enregistrerTransaction).toHaveBeenCalledTimes(1);
    expect(tables.recus).toHaveLength(1);
  });

  it("deux requêtes simultanées : une seule réussit, un seul encaissement, un seul reçu", async () => {
    const { PATCH } = await importRoute();
    const [a, b] = await Promise.all([PATCH(patch({ id: "B1", action: "confirme" })), PATCH(patch({ id: "B1", action: "confirme" }))]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(mocks.enregistrerTransaction).toHaveBeenCalledTimes(1);
    expect(tables.recus).toHaveLength(1);
    expect(mocks.enregistrerAction).toHaveBeenCalledTimes(1);
  });

  it("un autre agent gagne entre la lecture et l'écriture : 409, aucun effet de bord", async () => {
    avantUpdate = (table) => { if (table === "paid_bookings") bookingParId("B1").statut = "confirme"; };
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "confirme" }));
    const corps = await res.json();
    expect(res.status).toBe(409);
    expect(corps.statut_actuel).toBe("confirme");
    expect(mocks.enregistrerTransaction).not.toHaveBeenCalled();
    expect(mocks.enregistrerAction).not.toHaveBeenCalled();
    expect(ecrituresRdv).toHaveLength(0);
    expect(tables.recus).toHaveLength(0);
  });

  it("rejouer « valider » sur une réservation annulée est refusé", async () => {
    bookingParId("B1").statut = "annule";
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "confirme" }));
    expect(res.status).toBe(409);
    expect(mocks.enregistrerTransaction).not.toHaveBeenCalled();
  });

  it("rejouer « valider » sur une réservation marquée absente est refusé", async () => {
    bookingParId("B1").statut = "no_show";
    const { PATCH } = await importRoute();
    expect((await PATCH(patch({ id: "B1", action: "confirme" }))).status).toBe(409);
  });

  it("annuler une réservation déjà payée (appel direct) est refusé avec un message clair, rien d'écrit", async () => {
    bookingParId("B1").statut = "confirme";
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "annule", motif: "erreur de saisie" }));
    const corps = await res.json();
    expect(res.status).toBe(409);
    expect(corps.code).toBe("ANNULATION_PAYEE");
    expect(corps.error).toContain("Annuler la validation");
    expect(bookingParId("B1").statut).toBe("confirme");
    expect(ecrituresRdv).toHaveLength(0);
  });

  it("annuler la validation deux fois : un seul reversement", async () => {
    mocks.membre.role = "admin";
    bookingParId("B1").statut = "confirme";
    bookingParId("B1").traite_le = new Date().toISOString();
    const { PATCH } = await importRoute();
    const a = await PATCH(patch({ id: "B1", action: "annuler_validation", motif: "montant erroné" }));
    const b = await PATCH(patch({ id: "B1", action: "annuler_validation", motif: "montant erroné" }));
    expect(a.status).toBe(200);
    expect(b.status).toBe(400); // déjà revenue à « en_attente » : rien à annuler
    expect(mocks.enregistrerTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("ciblage par rdv_id (réservation créée après la migration)", () => {
  // Le trigger SQL lui-même ne peut pas être exécuté ici (faux Supabase en
  // mémoire) : il se contrôle en base par la requête dédiée. Ce test vérifie
  // le comportement de la route sur une réservation dont rdv_id est déjà
  // renseigné (ce que le trigger produit) : le repli par code n'est jamais utilisé.
  it("rdv_id renseigné : seul ce RDV est écrit, même si un autre RDV porte le code", async () => {
    tables.rdv.push(rdv("R4", CITOYEN_1, null)); // lié par rdv_id, sans qr_token
    tables.rdv.push(rdv("R4bis", CITOYEN_1, "444444")); // porte le code mais n'est pas le RDV lié
    tables.paid_bookings.push(reservation("B4", CITOYEN_1, "444444", "R4"));
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B4", action: "confirme" }));
    expect((await res.json()).rdv_lie).toBe(true);
    expect(rdvParId("R4").statut).toBe("confirme");
    expect(rdvParId("R4bis").statut).toBe("nouveau");
    expect(ecrituresRdv.map((e) => e.id)).toEqual(["R4"]);
  });
});

describe("montant vu par l'agent (P1-3)", () => {
  it("montant_vu égal au prix courant : validation acceptée", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "confirme", montant_vu: 2000 }));
    expect(res.status).toBe(200);
    expect(mocks.enregistrerTransaction).toHaveBeenCalledTimes(1);
  });

  it("prix modifié entre la lecture et la validation : 409 PRIX_MODIFIE, rien d'écrit", async () => {
    prixService = 2500;
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "confirme", montant_vu: 2000 }));
    const corps = await res.json();
    expect(res.status).toBe(409);
    expect(corps.code).toBe("PRIX_MODIFIE");
    expect(corps.prix_courant).toBe(2500);
    expect(corps.montant_declare).toBe(2000);
    expect(bookingParId("B1").statut).toBe("en_attente");
    expect(mocks.enregistrerTransaction).not.toHaveBeenCalled();
    expect(ecrituresRdv).toHaveLength(0);
  });

  it("montant_vu absent : validation inchangée, avertissement loggé", async () => {
    const avertir = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "confirme" }));
    expect(res.status).toBe(200);
    expect(avertir).toHaveBeenCalledWith(expect.stringContaining("montant_vu absent"), expect.stringContaining("B1"));
    avertir.mockRestore();
  });

  it("montant_vu invalide : 400", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "confirme", montant_vu: "beaucoup" }));
    expect(res.status).toBe(400);
    expect(bookingParId("B1").statut).toBe("en_attente");
  });

  it("GET expose le montant déclaré et le prix courant", async () => {
    prixService = 2500;
    const { GET } = await importRoute();
    const { booking } = await (await GET(get("id=B1"))).json();
    expect(booking.montant_declare).toBe(2000);
    expect(booking.prix_courant).toBe(2500);
    expect(booking.service_prix).toBe(2500);
  });
});

describe("code de confirmation en double (P1-4)", () => {
  it("deux réservations de même code : 409 explicite au lieu de « introuvable »", async () => {
    tables.paid_bookings.push(reservation("B6", CITOYEN_2, "111111", null));
    const { GET } = await importRoute();
    const res = await GET(get("code=111111"));
    const corps = await res.json();
    expect(res.status).toBe(409);
    expect(corps.code).toBe("CODE_EN_DOUBLE");
    expect(corps.error).toContain("Plusieurs réservations");
  });

  it("code unique : fiche renvoyée ; code inconnu : 404", async () => {
    const { GET } = await importRoute();
    const ok = await GET(get("code=222222"));
    expect(ok.status).toBe(200);
    expect((await ok.json()).booking.id).toBe("B2");
    expect((await GET(get("code=999999"))).status).toBe(404);
  });
});

describe("limiteur de tentatives sur la saisie du code (P1-4)", () => {
  const echecs = (n: number, extra: Ligne = {}) => Array.from({ length: n }, (_, i) => ({
    id: `echec-${extra.membre_id ?? "membre-1"}-${i}`, institution_id: INSTITUTION, membre_id: "membre-1", reussie: false, tentee_le: new Date().toISOString(), ...extra,
  }));

  it("10 codes inconnus d'affilée bloquent la suite, même avec un code valide : 429 au message neutre", async () => {
    const { GET } = await importRoute();
    for (let i = 0; i < 10; i++) expect((await GET(get(`code=99999${i}`))).status).toBe(404);
    expect(tables.validation_code_tentatives).toHaveLength(10);
    const res = await GET(get("code=222222"));
    const corps = await res.json();
    expect(res.status).toBe(429);
    expect(corps.code).toBe("TROP_DE_TENTATIVES");
    expect(corps.error).toBe("Trop de tentatives. Réessayez dans quelques minutes.");
    expect(res.headers.get("Retry-After")).toBe("60");
  });

  it("le blocage d'un agent n'empêche pas un autre agent de l'institution", async () => {
    tables.validation_code_tentatives.push(...echecs(10));
    mocks.membre.membreId = "membre-2";
    const { GET } = await importRoute();
    expect((await GET(get("code=222222"))).status).toBe(200);
  });

  it("plafond par institution : 30 échecs répartis sur plusieurs agents bloquent tout le monde", async () => {
    tables.validation_code_tentatives.push(...echecs(10, { membre_id: "autre-1" }), ...echecs(10, { membre_id: "autre-2" }), ...echecs(10, { membre_id: "autre-3" }));
    const { GET } = await importRoute();
    expect((await GET(get("code=222222"))).status).toBe(429);
  });

  it("fenêtre glissante : des échecs vieux de plus de 10 minutes ne comptent plus", async () => {
    const ancien = new Date(Date.now() - 11 * 60 * 1000).toISOString();
    tables.validation_code_tentatives.push(...echecs(10, { tentee_le: ancien }));
    const { GET } = await importRoute();
    expect((await GET(get("code=222222"))).status).toBe(200);
  });

  it("une recherche réussie, un doublon de code ou une recherche par id ne comptent pas comme échec", async () => {
    tables.paid_bookings.push(reservation("B6", CITOYEN_2, "111111", null));
    const { GET } = await importRoute();
    await GET(get("code=222222"));
    await GET(get("code=111111")); // doublon
    await GET(get("id=B2"));
    expect(tables.validation_code_tentatives).toHaveLength(0);
  });

  it("table absente (migration non appliquée) : le guichet n'est pas bloqué", async () => {
    tablesAbsentes.add("validation_code_tentatives");
    const { GET } = await importRoute();
    expect((await GET(get("code=222222"))).status).toBe(200);
    expect((await GET(get("code=999999"))).status).toBe(404);
  });
});

describe("état final dans les réponses (P1-6)", () => {
  it("succès : l'état final de la réservation accompagne la réponse", async () => {
    const { PATCH } = await importRoute();
    const corps = await (await PATCH(patch({ id: "B1", action: "confirme" }))).json();
    expect(corps.etat).toMatchObject({ statut: "confirme", montant_paye: 2000, montant_declare: 2000, rdv_id: "R1" });
    expect(typeof corps.etat.traite_le).toBe("string");
  });

  it("refus 409 : l'état actuel est renvoyé pour resynchroniser l'écran", async () => {
    const { PATCH } = await importRoute();
    await PATCH(patch({ id: "B1", action: "confirme" }));
    const second = await PATCH(patch({ id: "B1", action: "confirme" }));
    const corps = await second.json();
    expect(second.status).toBe(409);
    expect(corps.etat.statut).toBe("confirme");
  });

  it("réservation d'une autre institution : 404 sans état (aucune fuite)", async () => {
    tables.paid_bookings.push(reservation("BX", CITOYEN_1, "555555", null, { institution_id: "autre-institution" }));
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "BX", action: "confirme" }));
    const corps = await res.json();
    expect(res.status).toBe(404);
    expect(corps.etat).toBeUndefined();
  });
});

describe("revalidation après annulation de validation (P1-7)", () => {
  it("refusée quand un reçu archivé existe : message exact, aucun encaissement", async () => {
    tables.recus.push({ id: "recu-1", paid_booking_id: "B1", statut: "archive" });
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "confirme" }));
    const corps = await res.json();
    expect(res.status).toBe(409);
    expect(corps.error).toBe("Cette réservation a déjà été validée puis annulée. Un reçu est archivé : créez une nouvelle réservation.");
    expect(mocks.enregistrerTransaction).not.toHaveBeenCalled();
    expect(bookingParId("B1").statut).toBe("en_attente");
  });
});

describe("permissions — annuler la validation (P1-2)", () => {
  it("un admin dont le domaine « finance » est restreint ne peut plus reverser un paiement", async () => {
    mocks.membre.role = "admin";
    mocks.membre.accesRestreints = ["finance"];
    bookingParId("B1").statut = "confirme";
    bookingParId("B1").traite_le = new Date().toISOString();
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "annuler_validation", motif: "montant erroné" }));
    expect(res.status).toBe(403);
    expect(bookingParId("B1").statut).toBe("confirme");
    expect(mocks.enregistrerTransaction).not.toHaveBeenCalled();
  });
});

describe("anomalies non bloquantes signalées (jamais silencieuses)", () => {
  it("encaissement non enregistré au registre : la validation aboutit, ledger_ok false", async () => {
    mocks.enregistrerTransaction.mockResolvedValue(null);
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "confirme" }));
    const corps = await res.json();
    expect(res.status).toBe(200);
    expect(corps.ledger_ok).toBe(false);
  });
});

describe("montant_vu_base (Mission B)", () => {
  it("« declare » : l'agent a vu le montant déclaré, le prix a changé depuis : validation acceptée", async () => {
    prixService = 2500;
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "confirme", montant_vu: 2000, montant_vu_base: "declare" }));
    expect(res.status).toBe(200);
    expect(mocks.enregistrerTransaction).toHaveBeenCalledTimes(1);
  });

  it("« declare » : montant vu différent du montant déclaré : 409 MONTANT_VU_DIFFERENT, valeurs renvoyées, rien d'écrit", async () => {
    prixService = 2500;
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "confirme", montant_vu: 2500, montant_vu_base: "declare" }));
    const corps = await res.json();
    expect(res.status).toBe(409);
    expect(corps.code).toBe("MONTANT_VU_DIFFERENT");
    expect(corps).toMatchObject({ montant_vu: 2500, montant_declare: 2000, prix_courant: 2500 });
    expect(corps.error).not.toContain("prix du service a changé");
    expect(bookingParId("B1").statut).toBe("en_attente");
    expect(mocks.enregistrerTransaction).not.toHaveBeenCalled();
    expect(ecrituresRdv).toHaveLength(0);
  });

  it("« declare » sans déclaration du citoyen : retombe sur le prix courant (PRIX_MODIFIE si écart)", async () => {
    prixService = 0;
    Object.assign(bookingParId("B1"), { declare_le: null, montant_declare_citoyen: null, montant_paye: null });
    const { PATCH } = await importRoute();
    const ecart = await PATCH(patch({ id: "B1", action: "confirme", montant_vu: 100, montant_vu_base: "declare" }));
    expect(ecart.status).toBe(409);
    expect((await ecart.json()).code).toBe("PRIX_MODIFIE");
    const ok = await PATCH(patch({ id: "B1", action: "confirme", montant_vu: 0, montant_vu_base: "declare" }));
    expect(ok.status).toBe(200);
  });

  it("« prix » explicite : comparaison au prix courant, comme avant", async () => {
    prixService = 2500;
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "confirme", montant_vu: 2000, montant_vu_base: "prix" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("PRIX_MODIFIE");
  });

  it("base inconnue : 400, rien d'écrit", async () => {
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "confirme", montant_vu: 2000, montant_vu_base: "autre" }));
    expect(res.status).toBe(400);
    expect(bookingParId("B1").statut).toBe("en_attente");
  });

  it("MONTANTS_INCOHERENTS reste prioritaire, même avec « declare »", async () => {
    Object.assign(bookingParId("B1"), { montant_paye: 2000, montant_declare_citoyen: 1500 });
    const { PATCH } = await importRoute();
    const res = await PATCH(patch({ id: "B1", action: "confirme", montant_vu: 1500, montant_vu_base: "declare" }));
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("MONTANTS_INCOHERENTS");
    expect(mocks.enregistrerTransaction).not.toHaveBeenCalled();
  });
});

describe("GET — champs de la fiche de validation (Mission B)", () => {
  const rdvDe = (id: string, citoyen: string, extra: Ligne): Ligne => ({ ...rdv(id, citoyen, null), ...extra });

  it("date de naissance et sexe ne sont plus renvoyés", async () => {
    tables.users[0].date_naissance = "1990-01-01";
    tables.users[0].sexe = "femme";
    const { GET } = await importRoute();
    const { booking } = await (await GET(get("id=B1"))).json();
    expect(booking).not.toHaveProperty("citoyen_sexe");
    expect(booking).not.toHaveProperty("citoyen_date_naissance_renseignee");
    expect(JSON.stringify(booking)).not.toContain("1990-01-01");
  });

  it("identite_verifiee : true / false selon la colonne, null si absente", async () => {
    const { GET } = await importRoute();
    expect((await (await GET(get("id=B1"))).json()).booking.identite_verifiee).toBeNull();
    tables.users[0].identite_verifiee = true;
    tables.users[1].identite_verifiee = false;
    expect((await (await GET(get("id=B1"))).json()).booking.identite_verifiee).toBe(true);
    expect((await (await GET(get("id=B2"))).json()).booking.identite_verifiee).toBe(false);
  });

  it("historique : mêmes compteurs que statsClient, limité à ce citoyen et à cet établissement", async () => {
    tables.rdv.push(
      rdvDe("H1", CITOYEN_1, { statut: "termine", presence_status: "present", date_rdv: "2026-05-01" }),
      rdvDe("H2", CITOYEN_1, { statut: "termine", presence_status: "present", date_rdv: "2026-06-01" }),
      rdvDe("H3", CITOYEN_1, { statut: "termine", presence_status: "absent", date_rdv: "2026-07-01" }),
      rdvDe("H4", CITOYEN_1, { statut: "annule", annule_par: "citoyen", date_rdv: "2026-04-01" }),
      rdvDe("H5", CITOYEN_2, { statut: "termine", date_rdv: "2026-03-01" }),
      { ...rdvDe("H6", CITOYEN_1, { statut: "termine" }), institution_id: "autre-institution" },
    );
    const { GET } = await importRoute();
    const { booking } = await (await GET(get("id=B1"))).json();
    // R1 (en cours) + H1..H4 = 5 RDV de ce citoyen ; H5 (autre citoyen) et H6 (autre établissement) exclus.
    expect(booking.historique).toEqual({ total: 5, termines: 2, absences: 1, annulations_citoyen: 1, premier_rdv: "2026-04-01", tronque: false });
  });

  it("historique illisible : null (jamais « premier rendez-vous » par défaut)", async () => {
    tablesAbsentes.add("rdv");
    const { GET } = await importRoute();
    const { booking } = await (await GET(get("id=B1"))).json();
    expect(booking.historique).toBeNull();
    expect(booking.rdv_lie).toBe(false);
  });

  it("référence, guichet, instructions et demande du client viennent du RDV lié", async () => {
    Object.assign(rdvParId("R1"), {
      reference: "RDV-2026-0001", guichet: "Guichet 3", instructions_accueil: "Apporter la pièce d'identité",
      description_besoin: "Ouverture de compte", champs_complementaires_reponses: { Motif: "Épargne" },
    });
    const { GET } = await importRoute();
    const { booking } = await (await GET(get("id=B1"))).json();
    expect(booking).toMatchObject({
      reference: "RDV-2026-0001", guichet: "Guichet 3", instructions_accueil: "Apporter la pièce d'identité",
      description_besoin: "Ouverture de compte", champs_complementaires: { Motif: "Épargne" },
    });
  });

  it("sans RDV lié : champs du RDV à null, demande à null", async () => {
    tables.paid_bookings.push(reservation("B3", CITOYEN_1, "333333", null));
    const { GET } = await importRoute();
    const { booking } = await (await GET(get("id=B3"))).json();
    expect(booking).toMatchObject({ rdv_lie: false, reference: null, guichet: null, instructions_accueil: null, description_besoin: null, champs_complementaires: null });
  });

  it("rôle sans accès à l'onglet : 403, aucune donnée de la fiche", async () => {
    mocks.membre.role = "comptable";
    const { GET } = await importRoute();
    const res = await GET(get("id=B1"));
    expect(res.status).toBe(403);
    expect(await res.text()).not.toContain("confirmation_code");
  });

  it("droits : mêmes tests que le PATCH (agent, admin, admin au domaine finance restreint)", async () => {
    bookingParId("B1").statut = "confirme";
    const { GET } = await importRoute();
    const lire = async () => (await (await GET(get("id=B1"))).json()).booking.droits;
    mocks.membre.role = "agent";
    expect(await lire()).toEqual({ traiter: true, annuler_validation: false });
    mocks.membre.role = "admin";
    expect(await lire()).toEqual({ traiter: true, annuler_validation: true });
    mocks.membre.accesRestreints = ["finance"];
    expect(await lire()).toEqual({ traiter: true, annuler_validation: false });
    bookingParId("B1").statut = "en_attente";
    mocks.membre.role = "agent";
    mocks.membre.accesRestreints = [];
    expect(await lire()).toEqual({ traiter: true, annuler_validation: true });
  });

  it("établissement suspendu : indiqué par le même test que le PATCH", async () => {
    const { GET } = await importRoute();
    expect((await (await GET(get("id=B1"))).json()).booking.etablissement_suspendu).toBe(false);
    mocks.suspendu = true;
    expect((await (await GET(get("id=B1"))).json()).booking.etablissement_suspendu).toBe(true);
  });
});
