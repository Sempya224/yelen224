import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { MembreRole } from "@/lib/institutionPermissions";

// ─────────────────────────────────────────────────────────────────────────
// GAP-05-05 (23/10/2026) — audit "accès direct par URL" des 12 groupes de
// routes institution : disponibilites, services, analyse, signalements,
// documents-citoyen, clock-in, transactions, rapports, offres, partenariat,
// documents-financiers, documents-travail.
//
// Trois propriétés vérifiées, route par route :
//   1. un rôle non autorisé par lib/institutionPermissions.ts (ou un membre
//      dont le domaine a été retiré via acces_restreints) reçoit 403, sans
//      aucune écriture — et, sauf exception listée (lecture d'appartenance
//      faite avant le contrôle de rôle), sans aucune requête en base ;
//   2. un membre d'une AUTRE institution n'obtient jamais un objet qui ne
//      lui appartient pas : 404 (convention du projet, ne révèle pas
//      l'existence de l'objet — même choix que GAP-07-01), aucune écriture,
//      aucune donnée de l'objet dans la réponse ;
//   3. un institution_id injecté dans l'URL est ignoré : tous les filtres
//      de tenant appliqués en base portent l'institution du jeton.
// ─────────────────────────────────────────────────────────────────────────

vi.hoisted(() => {
  // Valeurs factices (mêmes placeholders que .github/workflows/ci.yml) :
  // certaines dépendances transitives valident le format au chargement.
  const env: Record<string, string> = {
    NEXT_PUBLIC_SUPABASE_URL: "https://placeholder.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "placeholder-service-role-key-for-ci-build-only",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "placeholder-anon-key-for-ci-build-only",
    INSTITUTION_JWT_SECRET: "placeholder-secret-for-ci-build-only-0000000000000000",
    NEXT_PUBLIC_APP_URL: "https://example.com",
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: "BGCBAFnXrEZh8VlwuZOljwEYalEpziGu0WR1WKyLtwr6Cs_3QJ6BU7CiRpj47mk9CqwL2nU5rpgCPgzsGl4rvUE",
    VAPID_PRIVATE_KEY: "sKZHj4Zf6_BCgos0seQVjfnjGMoEsbYMiadJlSMHLKo",
    VAPID_SUBJECT: "mailto:ci-build@example.com",
  };
  for (const [k, v] of Object.entries(env)) process.env[k] ??= v;
});

const { getAuthenticatedMembre } = vi.hoisted(() => ({ getAuthenticatedMembre: vi.fn() }));
vi.mock("@/lib/institutionAuth", async (importOriginal) => {
  const reel = await importOriginal<typeof import("@/lib/institutionAuth")>();
  return { ...reel, getAuthenticatedMembre };
});

// Le journal d'activité n'est pas un accès métier : certaines routes
// (clock-in/employees) journalisent la tentative refusée AVANT le 403.
vi.mock("@/lib/journalActivite", async (importOriginal) => {
  const reel = await importOriginal<typeof import("@/lib/journalActivite")>();
  return { ...reel, enregistrerAction: vi.fn(async () => {}), getMembreNomPourJournal: vi.fn(async () => "Membre Test") };
});

// ─── Fausse base Supabase générique ────────────────────────────────────
// Chaque `from(table)` / `rpc(nom)` / `storage.from(bucket)` crée une
// requête enregistrée (table, filtres eq, opération). Toute méthode de
// chaîne est acceptée ; `await` renvoie les lignes de la graine filtrées
// par les eq connus, `maybeSingle`/`single` la première.
type Ligne = Record<string, unknown>;
type Requete = { table: string; op: string; filtres: [string, unknown][] };

const INST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const INST_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OBJET_ID = "0b1ec700-0000-4000-8000-000000000001";
const MARQUEUR = "DONNEE_CONFIDENTIELLE_INSTITUTION_A";

const etat: { requetes: Requete[]; proprietaire: string } = { requetes: [], proprietaire: INST_B };

// Graine générique : une seule ligne, dans n'importe quelle table, qui
// appartient à `etat.proprietaire`. Pour les tests de rôle, le membre est
// propriétaire (les lectures d'appartenance réussissent, seul le rôle
// bloque) ; pour les tests multi-tenant, l'objet appartient à l'autre
// institution.
function lignesPour(r: Requete): Ligne[] {
  if (r.table.startsWith("rpc:") || r.table.startsWith("storage:")) return [];
  const ligne: Ligne = {
    id: OBJET_ID, institution_id: etat.proprietaire, statut: "brouillon", secret: MARQUEUR,
    titre: MARQUEUR, nom: MARQUEUR, url: `https://placeholder.supabase.co/${MARQUEUR}`, storage_path: MARQUEUR,
    membre_id: "autre-membre", citoyen_id: "citoyen-a",
    // Champs date lus par les agrégations (analyse, vues, présences).
    created_at: "2026-10-01T10:00:00.000Z", horodatage: "2026-10-01T10:00:00.000Z",
    date: "2026-10-01", date_rdv: "2026-10-01", heure_rdv: "10:00",
  };
  const correspond = r.filtres.every(([col, val]) => !(col in ligne) || ligne[col] === val);
  return correspond ? [ligne] : [];
}

const METHODES_ECRITURE = new Set(["insert", "update", "delete", "upsert", "upload", "remove"]);

function creerRequete(table: string): unknown {
  const r: Requete = { table, op: "select", filtres: [] };
  etat.requetes.push(r);
  const chaine: unknown = new Proxy(() => chaine, {
    get(_cible, prop) {
      if (prop === "then") {
        return (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) =>
          Promise.resolve({ data: lignesPour(r), error: null, count: lignesPour(r).length }).then(ok, ko);
      }
      if (prop === "maybeSingle" || prop === "single") {
        return () => Promise.resolve({ data: lignesPour(r)[0] ?? null, error: null });
      }
      return (...args: unknown[]) => {
        if (prop === "eq") r.filtres.push([String(args[0]), args[1]]);
        if (typeof prop === "string" && METHODES_ECRITURE.has(prop)) r.op = prop;
        return chaine;
      };
    },
  });
  return chaine;
}

const fauxClient: unknown = new Proxy({}, {
  get(_cible, prop) {
    if (prop === "from") return (t: string) => creerRequete(t);
    if (prop === "rpc") return (n: string) => creerRequete(`rpc:${n}`);
    if (prop === "storage") return { from: (b: string) => creerRequete(`storage:${b}`) };
    return creerRequete(String(prop));
  },
});

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn(() => fauxClient) }));

const ecritures = () => etat.requetes.filter((r) => r.op !== "select");

// ─── Chargement des routes (imports statiques, résolus par Vite) ───────
type Handler = (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;
type Module = Record<string, unknown>;

const ROUTES: Record<string, () => Promise<Module>> = {
  "disponibilites": () => import("./disponibilites/route"),
  "services": () => import("./services/route"),
  "services/media": () => import("./services/media/route"),
  "analyse/acquisition": () => import("./analyse/acquisition/route"),
  "analyse/canal": () => import("./analyse/canal/route"),
  "analyse/clients": () => import("./analyse/clients/route"),
  "analyse/evolution": () => import("./analyse/evolution/route"),
  "analyse/heatmap": () => import("./analyse/heatmap/route"),
  "analyse/top-offres": () => import("./analyse/top-offres/route"),
  "analyse/tunnel": () => import("./analyse/tunnel/route"),
  "analyse/villes": () => import("./analyse/villes/route"),
  "analyse/vue-ensemble": () => import("./analyse/vue-ensemble/route"),
  "signalements": () => import("./signalements/route"),
  "signalements/rdv-eligibles": () => import("./signalements/rdv-eligibles/route"),
  "signalements/[id]": () => import("./signalements/[id]/route"),
  "signalements/[id]/attachments": () => import("./signalements/[id]/attachments/route"),
  "signalements/[id]/notes": () => import("./signalements/[id]/notes/route"),
  "signalements/[id]/actions": () => import("./signalements/[id]/actions/route"),
  "documents-citoyen": () => import("./documents-citoyen/route"),
  "documents-citoyen/clients": () => import("./documents-citoyen/clients/route"),
  "documents-citoyen/[id]": () => import("./documents-citoyen/[id]/route"),
  "documents-citoyen/[id]/actions": () => import("./documents-citoyen/[id]/actions/route"),
  "clock-in/attendance": () => import("./clock-in/attendance/route"),
  "clock-in/corrections": () => import("./clock-in/corrections/route"),
  "clock-in/departments": () => import("./clock-in/departments/route"),
  "clock-in/employees": () => import("./clock-in/employees/route"),
  "clock-in/employees/documents": () => import("./clock-in/employees/documents/route"),
  "clock-in/schedule-assignments": () => import("./clock-in/schedule-assignments/route"),
  "clock-in/work-schedules": () => import("./clock-in/work-schedules/route"),
  "clock-in/work-zones": () => import("./clock-in/work-zones/route"),
  "transactions": () => import("./transactions/route"),
  "transactions/export": () => import("./transactions/export/route"),
  "rapports": () => import("./rapports/route"),
  "rapports/executif": () => import("./rapports/executif/route"),
  "rapports/pdf": () => import("./rapports/pdf/route"),
  "offres": () => import("./offres/route"),
  "offres/[id]": () => import("./offres/[id]/route"),
  "offres/media": () => import("./offres/media/route"),
  "offres/vues": () => import("./offres/vues/route"),
  "partenariat": () => import("./partenariat/route"),
  "documents-financiers": () => import("./documents-financiers/route"),
  "documents-travail": () => import("./documents-travail/route"),
};

type Methode = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

async function appeler(route: string, methode: Methode, opts: { query?: string; body?: Ligne } = {}) {
  const mod = await ROUTES[route]();
  const handler = mod[methode] as Handler | undefined;
  if (!handler) throw new Error(`${methode} absent de ${route}`);
  const url = `http://localhost/api/institution/${route.replace("[id]", OBJET_ID)}${opts.query ? `?${opts.query}` : ""}`;
  const init: { method: Methode; body?: string; headers?: Record<string, string> } = { method: methode };
  if (methode !== "GET") {
    init.body = JSON.stringify(opts.body ?? {});
    init.headers = { "content-type": "application/json" };
  }
  return handler(new NextRequest(url, init), { params: Promise.resolve({ id: OBJET_ID }) });
}

function connecter(role: MembreRole, institutionId = INST_B, accesRestreints: string[] | null = null) {
  getAuthenticatedMembre.mockResolvedValue({ institutionId, membreId: "membre-b", role, accesRestreints });
}

beforeAll(async () => {
  // Préchauffage du graphe de modules hors délai des tests (voir
  // app/api/checkin/scan/route.test.ts).
  for (const charger of Object.values(ROUTES)) await charger();
}, 120_000);

beforeEach(() => {
  vi.clearAllMocks();
  etat.requetes = [];
  etat.proprietaire = INST_B;
});

// ─── 1. Rôle non autorisé -> 403 ──────────────────────────────────────
// `refuses` = rôles que lib/institutionPermissions.ts n'autorise pas sur ce
// handler (TAB_MATRIX pour les lectures, ACTION_MATRIX pour les écritures).
// `lectureAvant` = la route vérifie d'abord l'appartenance de l'objet à
// l'institution (lecture), puis le rôle : aucune écriture exigée, mais une
// lecture tolérée avant le 403.
type CasRole = { route: string; methode: Methode; refuses: MembreRole[]; lectureAvant?: true };

const CAS_ROLES: Record<string, CasRole[]> = {
  disponibilites: [
    { route: "disponibilites", methode: "PUT", refuses: ["agent", "comptable", "dirigeant"] },
  ],
  services: [
    { route: "services", methode: "GET", refuses: ["agent", "dirigeant"] },
    { route: "services", methode: "POST", refuses: ["agent", "dirigeant"] },
    { route: "services", methode: "PATCH", refuses: ["agent", "dirigeant"] },
    { route: "services", methode: "DELETE", refuses: ["agent", "dirigeant"] },
    { route: "services/media", methode: "POST", refuses: ["agent", "dirigeant"] },
  ],
  analyse: [
    "acquisition", "canal", "clients", "evolution", "heatmap", "top-offres", "tunnel", "villes", "vue-ensemble",
  ].map((r): CasRole => ({ route: `analyse/${r}`, methode: "GET", refuses: ["agent", "comptable"] })),
  signalements: [
    { route: "signalements", methode: "GET", refuses: ["agent", "comptable"] },
    { route: "signalements", methode: "POST", refuses: ["agent", "comptable", "dirigeant"] },
    { route: "signalements/rdv-eligibles", methode: "GET", refuses: ["agent", "comptable", "dirigeant"] },
    { route: "signalements/[id]", methode: "GET", refuses: ["agent", "comptable"] },
    { route: "signalements/[id]/attachments", methode: "GET", refuses: ["agent", "comptable"] },
    { route: "signalements/[id]/attachments", methode: "POST", refuses: ["agent", "comptable", "dirigeant"] },
    { route: "signalements/[id]/notes", methode: "POST", refuses: ["agent", "comptable", "dirigeant"] },
    { route: "signalements/[id]/actions", methode: "POST", refuses: ["agent", "comptable", "dirigeant"], lectureAvant: true },
  ],
  "documents-citoyen": [
    { route: "documents-citoyen", methode: "GET", refuses: ["agent", "comptable", "dirigeant"] },
    { route: "documents-citoyen", methode: "POST", refuses: ["agent", "comptable", "dirigeant"] },
    { route: "documents-citoyen/clients", methode: "GET", refuses: ["agent", "comptable", "dirigeant"] },
    { route: "documents-citoyen/[id]", methode: "GET", refuses: ["agent", "comptable", "dirigeant"] },
    { route: "documents-citoyen/[id]/actions", methode: "POST", refuses: ["agent", "comptable", "dirigeant"] },
  ],
  "clock-in": [
    ...["attendance", "corrections", "departments", "employees", "employees/documents", "schedule-assignments", "work-schedules", "work-zones"]
      .map((r): CasRole => ({ route: `clock-in/${r}`, methode: "GET", refuses: ["agent", "comptable"] })),
    ...([
      ["corrections", "POST"],
      ["departments", "POST"], ["departments", "PATCH"], ["departments", "DELETE"],
      ["employees", "POST"], ["employees", "PATCH"], ["employees", "DELETE"],
      ["employees/documents", "POST"], ["employees/documents", "DELETE"],
      ["schedule-assignments", "POST"], ["schedule-assignments", "PATCH"], ["schedule-assignments", "DELETE"],
      ["work-schedules", "POST"], ["work-schedules", "PATCH"], ["work-schedules", "DELETE"],
      ["work-zones", "POST"], ["work-zones", "PATCH"],
    ] as const).map(([r, m]): CasRole => ({ route: `clock-in/${r}`, methode: m, refuses: ["agent", "comptable", "superviseur", "dirigeant"] })),
  ],
  transactions: [
    { route: "transactions", methode: "GET", refuses: ["agent", "superviseur", "dirigeant"] },
    { route: "transactions/export", methode: "GET", refuses: ["agent", "superviseur", "dirigeant"] },
  ],
  rapports: [
    { route: "rapports", methode: "GET", refuses: ["agent", "superviseur", "dirigeant"] },
    { route: "rapports/executif", methode: "GET", refuses: ["agent", "superviseur", "dirigeant"] },
    { route: "rapports/pdf", methode: "GET", refuses: ["agent", "superviseur", "dirigeant"] },
  ],
  offres: [
    { route: "offres", methode: "GET", refuses: ["agent", "comptable"] },
    { route: "offres", methode: "POST", refuses: ["agent", "comptable", "dirigeant"] },
    { route: "offres/vues", methode: "GET", refuses: ["agent", "comptable"] },
    { route: "offres/media", methode: "POST", refuses: ["agent", "comptable", "dirigeant"] },
    { route: "offres/[id]", methode: "PATCH", refuses: ["agent", "comptable", "dirigeant"], lectureAvant: true },
    { route: "offres/[id]", methode: "DELETE", refuses: ["agent", "comptable", "dirigeant"] },
  ],
  partenariat: [
    { route: "partenariat", methode: "GET", refuses: ["agent", "comptable"] },
    { route: "partenariat", methode: "POST", refuses: ["agent", "comptable", "superviseur", "dirigeant"] },
  ],
  "documents-financiers": [
    { route: "documents-financiers", methode: "GET", refuses: ["agent", "superviseur", "dirigeant"] },
    { route: "documents-financiers", methode: "POST", refuses: ["agent", "superviseur", "dirigeant"] },
    { route: "documents-financiers", methode: "DELETE", refuses: ["agent", "superviseur", "dirigeant"] },
  ],
  "documents-travail": [
    { route: "documents-travail", methode: "GET", refuses: ["comptable"] },
    { route: "documents-travail", methode: "POST", refuses: ["comptable"] },
    { route: "documents-travail", methode: "PATCH", refuses: ["comptable"] },
    { route: "documents-travail", methode: "DELETE", refuses: ["comptable"] },
  ],
};

describe.each(Object.entries(CAS_ROLES))("GAP-05-05 — groupe %s : rôle non autorisé -> 403", (_groupe, cas) => {
  const lignes = cas.flatMap((c) => c.refuses.map((role) => ({ ...c, role })));
  it.each(lignes)("$methode $route — $role", async ({ route, methode, role, lectureAvant }) => {
    connecter(role);
    const res = await appeler(route, methode, { query: `id=${OBJET_ID}`, body: { id: OBJET_ID } });
    expect(res.status).toBe(403);
    expect(ecritures()).toEqual([]);
    if (!lectureAvant) expect(etat.requetes).toEqual([]);
  });
});

// ─── 1 bis. Domaine retiré par acces_restreints -> 403 (E5/E6) ─────────
// Rôle autorisé, mais l'admin a retiré le domaine à CE membre
// (lib/institutionPermissions.ts::DOMAINE_TABS : finance -> transactions,
// rapports -> analyse).
describe("GAP-05-05 — domaine retiré via acces_restreints -> 403", () => {
  const cas: { route: string; role: MembreRole; domaine: string }[] = [
    { route: "transactions", role: "comptable", domaine: "finance" },
    { route: "transactions/export", role: "comptable", domaine: "finance" },
    { route: "transactions", role: "admin", domaine: "finance" },
    ...["acquisition", "canal", "clients", "evolution", "heatmap", "top-offres", "tunnel", "villes", "vue-ensemble"]
      .map((r) => ({ route: `analyse/${r}`, role: "superviseur" as MembreRole, domaine: "rapports" })),
  ];
  it.each(cas)("GET $route — $role sans le domaine $domaine", async ({ route, role, domaine }) => {
    connecter(role, INST_B, [domaine]);
    const res = await appeler(route, "GET");
    expect(res.status).toBe(403);
    expect(etat.requetes).toEqual([]);
  });
});

// ─── 2. Objet d'une autre institution -> 404, aucune écriture ni fuite ─
// Le membre est admin (aucun blocage de rôle) de l'institution B ; l'objet
// visé appartient à l'institution A.
describe("GAP-05-05 — membre d'une autre institution : objet jamais obtenu (404)", () => {
  const cas: { route: string; methode: Methode; query?: string; body?: Ligne }[] = [
    { route: "signalements/[id]", methode: "GET" },
    { route: "signalements/[id]/attachments", methode: "GET", query: `download=${OBJET_ID}` },
    { route: "signalements/[id]/attachments", methode: "POST" },
    { route: "signalements/[id]/notes", methode: "POST", body: { contenu: "note" } },
    { route: "signalements/[id]/actions", methode: "POST", body: { action: "assigner", assigneAMembreId: "membre-b" } },
    { route: "documents-citoyen", methode: "GET", query: `download=${OBJET_ID}` },
    { route: "documents-citoyen/[id]", methode: "GET" },
    { route: "documents-citoyen/[id]/actions", methode: "POST", body: { action: "commencer_verification" } },
    { route: "offres/[id]", methode: "PATCH", body: { titre: "modifié" } },
    { route: "offres/[id]", methode: "DELETE" },
    { route: "services", methode: "PATCH", body: { id: OBJET_ID, nom: "modifié" } },
    { route: "services", methode: "DELETE", query: `id=${OBJET_ID}` },
    { route: "clock-in/departments", methode: "PATCH", body: { id: OBJET_ID, nom: "modifié" } },
    { route: "clock-in/departments", methode: "DELETE", query: `id=${OBJET_ID}` },
    { route: "clock-in/employees", methode: "PATCH", body: { id: OBJET_ID, nom: "modifié" } },
    { route: "clock-in/employees", methode: "DELETE", query: `id=${OBJET_ID}` },
    { route: "clock-in/employees/documents", methode: "DELETE", query: `id=${OBJET_ID}` },
    { route: "clock-in/schedule-assignments", methode: "PATCH", body: { id: OBJET_ID } },
    { route: "clock-in/schedule-assignments", methode: "DELETE", query: `id=${OBJET_ID}` },
    { route: "clock-in/work-schedules", methode: "PATCH", body: { id: OBJET_ID, nom: "modifié" } },
    { route: "clock-in/work-schedules", methode: "DELETE", query: `id=${OBJET_ID}` },
    { route: "documents-financiers", methode: "GET", query: `download=${OBJET_ID}` },
    { route: "documents-financiers", methode: "DELETE", query: `id=${OBJET_ID}` },
    { route: "documents-travail", methode: "GET", query: `download=${OBJET_ID}` },
    { route: "documents-travail", methode: "PATCH", body: { id: OBJET_ID, nom: "modifié" } },
    { route: "documents-travail", methode: "DELETE", query: `id=${OBJET_ID}` },
  ];
  it.each(cas)("$methode $route", async ({ route, methode, query, body }) => {
    etat.proprietaire = INST_A;
    connecter("admin", INST_B);
    const res = await appeler(route, methode, { query, body });
    expect(res.status).toBe(404);
    expect(ecritures()).toEqual([]);
    expect(await res.text()).not.toContain(MARQUEUR);
  });
});

// ─── 3. institution_id injecté dans l'URL : ignoré ─────────────────────
// Chaque lecture, par un rôle autorisé de B, avec ?institution_id=A : tout
// filtre de tenant appliqué en base doit porter B (jamais A), et au moins
// un tel filtre doit exister (la requête est bien scopée).
describe("GAP-05-05 — institution_id injecté dans l'URL ignoré", () => {
  const cas: { route: string; role: MembreRole; query?: string }[] = [
    ...["acquisition", "canal", "clients", "evolution", "heatmap", "top-offres", "tunnel", "villes", "vue-ensemble"]
      .map((r) => ({ route: `analyse/${r}`, role: "admin" as MembreRole })),
    { route: "services", role: "admin" },
    { route: "signalements", role: "admin" },
    { route: "signalements/rdv-eligibles", role: "admin", query: "citoyen_id=citoyen-a" },
    { route: "documents-citoyen", role: "admin" },
    { route: "documents-citoyen/clients", role: "admin" },
    ...["attendance", "corrections", "departments", "employees", "employees/documents", "schedule-assignments", "work-schedules", "work-zones"]
      .map((r) => ({ route: `clock-in/${r}`, role: "admin" as MembreRole })),
    { route: "transactions", role: "comptable" },
    { route: "transactions/export", role: "comptable", query: "format=csv" },
    { route: "rapports", role: "comptable" },
    { route: "rapports/executif", role: "comptable" },
    { route: "rapports/pdf", role: "comptable" },
    { route: "offres", role: "superviseur" },
    { route: "offres/vues", role: "superviseur" },
    { route: "partenariat", role: "superviseur" },
    { route: "documents-financiers", role: "comptable" },
    { route: "documents-travail", role: "agent" },
  ];
  it.each(cas)("GET $route ($role de B, ?institution_id=A)", async ({ route, role, query }) => {
    connecter(role, INST_B);
    await appeler(route, "GET", { query: `institution_id=${INST_A}&institutionId=${INST_A}&employeeId=${OBJET_ID}${query ? `&${query}` : ""}` });
    const filtresTenant = etat.requetes.flatMap((r) =>
      r.filtres.filter(([col]) => col === "institution_id" || (r.table === "institutions" && col === "id")).map(([, v]) => v)
    );
    expect(filtresTenant).not.toContain(INST_A);
    expect(filtresTenant.length).toBeGreaterThan(0);
    expect(new Set(filtresTenant)).toEqual(new Set([INST_B]));
  });
});
