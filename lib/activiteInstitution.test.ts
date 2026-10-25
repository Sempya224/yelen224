import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────
// lib/activiteInstitution.ts — chantier COMPTES-INACTIFS.md, Phase 3.
// Le point le plus sensible à vérifier : reactiverInstitutionSiInactif ne
// doit JAMAIS lever/affecter une suspension dont l'origine n'est pas
// 'auto_inactivite' (exception 2.8.1 de la conception — une suspension
// disciplinaire 'admin'/'auto_rdv_non_traites' reste sous le contrôle
// exclusif d'un admin).
// ─────────────────────────────────────────────────────────────────────────

const { envoyerNotification } = vi.hoisted(() => ({ envoyerNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/notificationEngine", () => ({ envoyerNotification }));

import { toucherActiviteInstitution, reactiverInstitutionSiInactif } from "@/lib/activiteInstitution";

type Ligne = Record<string, unknown>;

function creerFauxSupabase(seed: { suspensions: Ligne[]; institution: Ligne | null }) {
  const updates: { table: string; filters: Record<string, unknown>; values: Ligne }[] = [];
  const inserts: { table: string; values: Ligne }[] = [];

  const sb = {
    _updates: updates,
    _inserts: inserts,
    from(table: string) {
      const rows: Ligne[] = table === "institution_suspensions" ? seed.suspensions : table === "institutions" ? (seed.institution ? [seed.institution] : []) : [];
      return {
        select() {
          const filters: Record<string, unknown> = {};
          const builder = {
            eq(col: string, val: unknown) { filters[col] = val; return builder; },
            maybeSingle: async () => {
              const match = rows.find(r => Object.entries(filters).every(([k, v]) => r[k] === v));
              return { data: match ?? null };
            },
          };
          return builder;
        },
        update(values: Ligne) {
          return { eq: async (_col: string, _val: unknown) => { updates.push({ table, filters: { _col, _val }, values }); return { error: null }; } };
        },
        insert(values: Ligne) {
          inserts.push({ table, values });
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return sb as unknown as import("@supabase/supabase-js").SupabaseClient;
}

beforeEach(() => { envoyerNotification.mockClear(); });

describe("reactiverInstitutionSiInactif", () => {
  it("lève une suspension active d'origine auto_inactivite et remet statut='validee'", async () => {
    const sb = creerFauxSupabase({
      suspensions: [{ id: "susp-1", institution_id: "inst-1", statut: "active", origine: "auto_inactivite" }],
      institution: { id: "inst-1", name: "Clinique Test" },
    });
    await reactiverInstitutionSiInactif(sb, "inst-1");

    const updates = (sb as unknown as { _updates: { table: string; values: Ligne }[] })._updates;
    expect(updates.find(u => u.table === "institution_suspensions")?.values).toMatchObject({ statut: "levee", levee_par: "auto" });
    expect(updates.find(u => u.table === "institutions" && u.values.statut === "validee")).toBeTruthy();
    expect(envoyerNotification).toHaveBeenCalledTimes(1);
  });

  it("ne touche JAMAIS une suspension active d'une autre origine (admin/auto_rdv_non_traites)", async () => {
    const sb = creerFauxSupabase({
      suspensions: [{ id: "susp-2", institution_id: "inst-1", statut: "active", origine: "auto_rdv_non_traites" }],
      institution: { id: "inst-1", name: "Clinique Test" },
    });
    await reactiverInstitutionSiInactif(sb, "inst-1");

    const updates = (sb as unknown as { _updates: { table: string; values: Ligne }[] })._updates;
    expect(updates).toHaveLength(0);
    expect(envoyerNotification).not.toHaveBeenCalled();
  });

  it("ne fait rien en l'absence de toute suspension", async () => {
    const sb = creerFauxSupabase({ suspensions: [], institution: { id: "inst-1", name: "Clinique Test" } });
    await reactiverInstitutionSiInactif(sb, "inst-1");

    const updates = (sb as unknown as { _updates: { table: string; values: Ligne }[] })._updates;
    expect(updates).toHaveLength(0);
    expect(envoyerNotification).not.toHaveBeenCalled();
  });
});

describe("toucherActiviteInstitution", () => {
  it("écrit derniere_action_qualifiante_le même quand aucune suspension n'est active", async () => {
    const sb = creerFauxSupabase({ suspensions: [], institution: { id: "inst-1", name: "Clinique Test" } });
    await toucherActiviteInstitution(sb, "inst-1");

    const updates = (sb as unknown as { _updates: { table: string; values: Ligne }[] })._updates;
    expect(updates.some(u => u.table === "institutions" && "derniere_action_qualifiante_le" in u.values)).toBe(true);
  });
});
