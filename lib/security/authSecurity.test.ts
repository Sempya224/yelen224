import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  evaluerTentative, enregistrerTentative, dureeBlocageMs,
  SEUIL_WARNING, SEUIL_BLOCAGE, SEUIL_SUPPORT_ONLY_CYCLES,
} from "./authSecurity";

// Faux client Supabase minimal — reproduit exactement les 4 formes
// d'appel utilisées par authSecurity.ts (select().eq().maybeSingle(),
// insert(), update().eq()), rien de plus. Isolé par test (aucun état
// partagé entre `it(...)`).
type Ligne = Record<string, unknown>;
function creerFauxSupabase(seed: Partial<Record<string, Ligne[]>> = {}) {
  const tables: Record<string, Ligne[]> = {
    auth_device_security: seed.auth_device_security ?? [],
    auth_ip_security: seed.auth_ip_security ?? [],
    auth_security_events: seed.auth_security_events ?? [],
  };
  const client = {
    from(table: string) {
      return {
        select() {
          return {
            eq(col: string, val: unknown) {
              return {
                async maybeSingle() {
                  const row = tables[table].find((r) => r[col] === val);
                  return { data: row ?? null, error: null };
                },
              };
            },
          };
        },
        async insert(row: Ligne) {
          tables[table].push({ ...row });
          return { data: null, error: null };
        },
        update(patch: Ligne) {
          return {
            eq(col: string, val: unknown) {
              const row = tables[table].find((r) => r[col] === val);
              if (row) Object.assign(row, patch);
              return Promise.resolve({ data: null, error: null });
            },
          };
        },
      };
    },
    _tables: tables,
  };
  return client as unknown as SupabaseClient & { _tables: typeof tables };
}

const ENDPOINT = "citoyen_login" as const;

describe("authSecurity — échelle du brief (1-2 autorisées, 3e = warning, 4e = blocked)", () => {
  it("respecte exactement les seuils annoncés (3 et 4)", () => {
    expect(SEUIL_WARNING).toBe(3);
    expect(SEUIL_BLOCAGE).toBe(4);
  });

  it("autorise les tentatives 1 et 2, avertit à la 3e, bloque à la 4e", async () => {
    const sb = creerFauxSupabase();
    const deviceId = "device-1", ip = "1.1.1.1";

    const t1 = await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId, ip, outcome: "not_found" });
    expect(t1.state).toBe("normal");

    const t2 = await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId, ip, outcome: "not_found" });
    expect(t2.state).toBe("normal");

    const t3 = await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId, ip, outcome: "not_found" });
    expect(t3.state).toBe("warning");

    // Le brief autorise encore une tentative pendant le warning.
    const porteApresWarning = await evaluerTentative(sb, { deviceId, ip });
    expect(porteApresWarning.state).toBe("normal");

    const t4 = await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId, ip, outcome: "not_found" });
    expect(t4.state).toBe("blocked");
    expect(t4.retryAfterS).toBeGreaterThan(0);

    const porteApresBlocage = await evaluerTentative(sb, { deviceId, ip });
    expect(porteApresBlocage.state).toBe("blocked");
  });
});

describe("authSecurity — clics rapides / requêtes concurrentes", () => {
  it("n'incrémente plus le compteur une fois l'état blocked déjà posé", async () => {
    const sb = creerFauxSupabase({
      auth_device_security: [{
        device_id: "device-2", ip_last: "1.1.1.1", state: "blocked",
        blocked_until: new Date(Date.now() + 60_000).toISOString(),
        window_started_at: new Date().toISOString(), attempts_in_window: 4,
        state_changed_at: new Date().toISOString(), block_cycles_24h: 1,
        cycles_window_started_at: new Date().toISOString(), blocked_reason: "x",
      }],
    });
    await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId: "device-2", ip: "1.1.1.1", outcome: "not_found" });
    await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId: "device-2", ip: "1.1.1.1", outcome: "not_found" });
    const row = sb._tables.auth_device_security.find((r) => r.device_id === "device-2");
    // Toujours 4 — les tentatives "en trop" pendant le blocage ne
    // rallongent pas le compteur (protection contre un marathon de clics
    // une fois déjà bloqué).
    expect(row?.attempts_in_window).toBe(4);
  });
});

describe("authSecurity — changement d'IP à appareil constant", () => {
  it("bloque toujours via le scope device malgré des IP différentes à chaque tentative", async () => {
    const sb = creerFauxSupabase();
    const deviceId = "device-3";
    await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId, ip: "1.1.1.1", outcome: "not_found" });
    await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId, ip: "2.2.2.2", outcome: "not_found" });
    const t3 = await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId, ip: "3.3.3.3", outcome: "not_found" });
    expect(t3.state).toBe("warning");
    const t4 = await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId, ip: "4.4.4.4", outcome: "not_found" });
    expect(t4.state).toBe("blocked");
  });
});

describe("authSecurity — changement d'appareil (rotation du cookie device) à IP constante", () => {
  it("bloque via le scope IP même si device_id change à chaque requête (contournement par appel API direct)", async () => {
    const sb = creerFauxSupabase();
    const ip = "9.9.9.9";
    await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId: "d1", ip, outcome: "not_found" });
    await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId: "d2", ip, outcome: "not_found" });
    const t3 = await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId: "d3", ip, outcome: "not_found" });
    expect(t3.state).toBe("warning");
    const t4 = await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId: "d4", ip, outcome: "not_found" });
    expect(t4.state).toBe("blocked");
  });
});

describe("authSecurity — anti-DoS par numéro de téléphone (plusieurs appareils sur un même compte)", () => {
  it("ne bloque jamais un appareil légitime uniquement parce que son identifiant a été ciblé ailleurs", async () => {
    const sb = creerFauxSupabase();
    const identifiant = "+224600000000";
    // Un attaquant martèle ce numéro depuis SON appareil jusqu'au blocage.
    for (let i = 0; i < 4; i++) {
      await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId: "attaquant", ip: "6.6.6.6", identifiant, outcome: "not_found" });
    }
    const etatAttaquant = await evaluerTentative(sb, { deviceId: "attaquant", ip: "6.6.6.6" });
    expect(etatAttaquant.state).toBe("blocked");

    // Le vrai propriétaire du numéro, sur SON appareil/IP à lui, reste
    // intact — le blocage ne porte jamais sur l'identifiant seul.
    const etatVraiProprietaire = await evaluerTentative(sb, { deviceId: "vrai-proprietaire", ip: "7.7.7.7" });
    expect(etatVraiProprietaire.state).toBe("normal");
  });
});

describe("authSecurity — expiration du blocage", () => {
  it("repart sur une fenêtre neuve une fois blocked_until dépassé", async () => {
    const sb = creerFauxSupabase({
      auth_device_security: [{
        device_id: "device-5", ip_last: "1.1.1.1", state: "blocked",
        blocked_until: new Date(Date.now() - 1_000).toISOString(),
        window_started_at: new Date(Date.now() - 999_999).toISOString(), attempts_in_window: 4,
        state_changed_at: new Date().toISOString(), block_cycles_24h: 1,
        cycles_window_started_at: new Date().toISOString(), blocked_reason: "x",
      }],
    });
    const porte = await evaluerTentative(sb, { deviceId: "device-5", ip: "1.1.1.1" });
    expect(porte.state).toBe("normal");

    const r = await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId: "device-5", ip: "1.1.1.1", outcome: "trouve" });
    expect(r.state).toBe("normal");
  });
});

describe("authSecurity — escalade des cycles de blocage", () => {
  it("allonge la durée à chaque cycle (30 min, 2 h, 24 h)", () => {
    expect(dureeBlocageMs(1)).toBe(30 * 60 * 1000);
    expect(dureeBlocageMs(2)).toBe(2 * 60 * 60 * 1000);
    expect(dureeBlocageMs(3)).toBe(24 * 60 * 60 * 1000);
  });

  it("bascule en support_only après le nombre de cycles configuré", async () => {
    const sb = creerFauxSupabase({
      auth_device_security: [{
        device_id: "device-6", ip_last: null, state: "normal", blocked_until: null,
        window_started_at: new Date().toISOString(), attempts_in_window: 0,
        state_changed_at: new Date().toISOString(), block_cycles_24h: SEUIL_SUPPORT_ONLY_CYCLES - 1,
        cycles_window_started_at: new Date().toISOString(), blocked_reason: null,
      }],
    });
    await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId: "device-6", ip: "1.1.1.1", outcome: "not_found" });
    await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId: "device-6", ip: "1.1.1.1", outcome: "not_found" });
    await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId: "device-6", ip: "1.1.1.1", outcome: "not_found" });
    const r = await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId: "device-6", ip: "1.1.1.1", outcome: "not_found" });
    expect(r.state).toBe("support_only");
    expect(r.retryAfterS).toBeUndefined();
  });
});

describe("authSecurity — correctif 12/09/2026 (bypass via 'trouve'/'code_envoye')", () => {
  it("un attaquant qui répète lookup/send-otp sans jamais vérifier le code finit par être bloqué (avant le correctif : jamais, car 'trouve' et 'code_envoye' réinitialisaient le compteur)", async () => {
    const sb = creerFauxSupabase();
    const deviceId = "attaquant-lookup", ip = "8.8.8.8";
    const t1 = await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId, ip, outcome: "trouve" });
    expect(t1.state).toBe("normal");
    const t2 = await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId, ip, outcome: "trouve" });
    expect(t2.state).toBe("normal");
    const t3 = await enregistrerTentative(sb, { endpointCategory: "institution_register", deviceId, ip, outcome: "code_envoye" });
    expect(t3.state).toBe("warning");
    const t4 = await enregistrerTentative(sb, { endpointCategory: "institution_register", deviceId, ip, outcome: "code_envoye" });
    expect(t4.state).toBe("blocked");
    expect(t4.retryAfterS).toBeGreaterThan(0);
  });

  it("un vrai succès (code_correct) réinitialise attempts_in_window mais préserve block_cycles_24h", async () => {
    const sb = creerFauxSupabase({
      auth_device_security: [{
        device_id: "device-8", ip_last: "1.1.1.1", state: "warning", blocked_until: null,
        window_started_at: new Date().toISOString(), attempts_in_window: 3,
        state_changed_at: new Date().toISOString(), block_cycles_24h: 2,
        cycles_window_started_at: new Date().toISOString(), blocked_reason: null,
      }],
      auth_ip_security: [{
        ip: "1.1.1.1", state: "warning", blocked_until: null,
        window_started_at: new Date().toISOString(), attempts_in_window: 3,
        state_changed_at: new Date().toISOString(), block_cycles_24h: 2,
        cycles_window_started_at: new Date().toISOString(), blocked_reason: null,
      }],
    });
    const r = await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId: "device-8", ip: "1.1.1.1", outcome: "code_correct" });
    expect(r.state).toBe("normal");
    const rowDevice = sb._tables.auth_device_security.find((row) => row.device_id === "device-8");
    expect(rowDevice?.attempts_in_window).toBe(0);
    expect(rowDevice?.block_cycles_24h).toBe(2); // historique d'abus 24h non effacé par un succès isolé
    const rowIp = sb._tables.auth_ip_security.find((row) => row.ip === "1.1.1.1");
    expect(rowIp?.attempts_in_window).toBe(0);
    expect(rowIp?.block_cycles_24h).toBe(2);
  });

  it("un flux de connexion légitime répété (trouve -> code_correct) n'atteint jamais warning, même deux fois de suite en 15 min (non-régression du correctif du 03/09)", async () => {
    const sb = creerFauxSupabase();
    const deviceId = "citoyen-legitime", ip = "10.10.10.10";
    for (let i = 0; i < 3; i++) {
      const tLookup = await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId, ip, outcome: "trouve" });
      expect(tLookup.state).toBe("normal");
      const tVerify = await enregistrerTentative(sb, { endpointCategory: ENDPOINT, deviceId, ip, outcome: "code_correct" });
      expect(tVerify.state).toBe("normal");
    }
  });
});

describe("authSecurity — inscription répétée / connexion répétée sur plusieurs endpoints", () => {
  it("compte les tentatives indépendamment de endpointCategory pour un même scope device", async () => {
    // Le compteur est par device/ip, pas par endpoint — un même appareil
    // qui alterne connexion/inscription reste soumis au même seuil global
    // sur ce device (device_id est le scope, endpointCategory ne fait que
    // qualifier l'événement journalisé).
    const sb = creerFauxSupabase();
    const deviceId = "device-7", ip = "5.5.5.5";
    await enregistrerTentative(sb, { endpointCategory: "citoyen_login", deviceId, ip, outcome: "not_found" });
    await enregistrerTentative(sb, { endpointCategory: "citoyen_register", deviceId, ip, outcome: "deja_enregistre" });
    const t3 = await enregistrerTentative(sb, { endpointCategory: "institution_login", deviceId, ip, outcome: "not_found" });
    expect(t3.state).toBe("warning");
  });
});
