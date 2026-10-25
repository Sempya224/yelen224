import { describe, it, expect, vi, beforeEach } from "vitest";

// ─────────────────────────────────────────────────────────────────────────
// lib/activiteCitoyenne.ts — chantier COMPTES-INACTIFS.md, Phase 3.
// Vérifie le point d'écriture unique du signal "action métier qualifiante"
// et la réactivation événementielle (jamais déclenchée par un simple
// chargement de page, uniquement par cette fonction).
// ─────────────────────────────────────────────────────────────────────────

const { envoyerNotification } = vi.hoisted(() => ({ envoyerNotification: vi.fn(async () => {}) }));
vi.mock("@/lib/notificationEngine", () => ({ envoyerNotification }));

import { toucherActiviteCitoyenne, reactiverCitoyenSiInactif } from "@/lib/activiteCitoyenne";

type Ligne = Record<string, unknown>;

function creerFauxSupabase(seed: { suspensionActive: Ligne | null; user: Ligne | null }) {
  const updates: { table: string; values: Ligne }[] = [];
  const inserts: { table: string; values: Ligne }[] = [];

  const sb = {
    _updates: updates,
    _inserts: inserts,
    from(table: string) {
      return {
        update(values: Ligne) {
          updates.push({ table, values });
          return { eq: async () => ({ error: null }) };
        },
        insert(values: Ligne) {
          inserts.push({ table, values });
          return Promise.resolve({ error: null });
        },
        select() {
          return {
            eq(_col: string, _val: unknown) {
              return {
                eq: () => ({ maybeSingle: async () => ({ data: table === "citoyen_inactivite_suspensions" ? seed.suspensionActive : null }) }),
                maybeSingle: async () => ({ data: table === "users" ? seed.user : null }),
              };
            },
          };
        },
      };
    },
  };
  return sb as unknown as import("@supabase/supabase-js").SupabaseClient;
}

beforeEach(() => { envoyerNotification.mockClear(); });

describe("toucherActiviteCitoyenne", () => {
  it("écrit derniere_action_qualifiante_le sans déclencher de réactivation si le compte n'est pas suspendu", async () => {
    const sb = creerFauxSupabase({ suspensionActive: null, user: { prenom: "Aminata" } });
    await toucherActiviteCitoyenne(sb, "citoyen-1");

    const updates = (sb as unknown as { _updates: { table: string; values: Ligne }[] })._updates;
    expect(updates.some(u => u.table === "users" && "derniere_action_qualifiante_le" in u.values)).toBe(true);
    expect(envoyerNotification).not.toHaveBeenCalled();
  });

  it("lève la suspension active, efface les marqueurs et notifie le retour quand le compte est suspendu", async () => {
    const sb = creerFauxSupabase({ suspensionActive: { id: "susp-1" }, user: { prenom: "Aminata" } });
    await toucherActiviteCitoyenne(sb, "citoyen-1");

    const updates = (sb as unknown as { _updates: { table: string; values: Ligne }[] })._updates;
    const inserts = (sb as unknown as { _inserts: { table: string; values: Ligne }[] })._inserts;

    const leveeUpdate = updates.find(u => u.table === "citoyen_inactivite_suspensions");
    expect(leveeUpdate?.values).toMatchObject({ statut: "levee", levee_par: "auto" });

    const marqueursUpdate = updates.find(u => u.table === "users" && "inactivite_j30_notifie_le" in u.values);
    expect(marqueursUpdate?.values).toMatchObject({ inactivite_j30_notifie_le: null, inactivite_j60_notifie_le: null });

    expect(inserts.some(i => i.table === "inactivite_observation_log" && i.values.evenement === "reactivation")).toBe(true);
    expect(envoyerNotification).toHaveBeenCalledTimes(1);
    expect(envoyerNotification).toHaveBeenCalledWith(expect.objectContaining({ destinataireId: "citoyen-1", destinataireType: "citoyen" }));
  });
});

describe("reactiverCitoyenSiInactif", () => {
  it("ne fait rien (aucun update, aucune notification) en l'absence de suspension active", async () => {
    const sb = creerFauxSupabase({ suspensionActive: null, user: null });
    await reactiverCitoyenSiInactif(sb, "citoyen-2");

    const updates = (sb as unknown as { _updates: { table: string; values: Ligne }[] })._updates;
    expect(updates).toHaveLength(0);
    expect(envoyerNotification).not.toHaveBeenCalled();
  });
});
