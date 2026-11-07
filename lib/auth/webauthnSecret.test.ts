import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chargerSecretWebAuthn, getWebAuthnJwtSecret, WebAuthnSecretError } from "./webauthnSecret";

const VAR = "CITOYEN_WEBAUTHN_JWT_SECRET";

describe("webauthnSecret", () => {
  const initial = process.env[VAR];

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (initial === undefined) delete process.env[VAR];
    else process.env[VAR] = initial;
    vi.restoreAllMocks();
  });

  it("refuse une variable absente", () => {
    delete process.env[VAR];
    expect(() => getWebAuthnJwtSecret()).toThrow(WebAuthnSecretError);
  });

  it("refuse une variable vide", () => {
    process.env[VAR] = "";
    expect(() => getWebAuthnJwtSecret()).toThrow(WebAuthnSecretError);
  });

  it("refuse un secret de 31 caractères", () => {
    process.env[VAR] = "a".repeat(31);
    expect(() => getWebAuthnJwtSecret()).toThrow(/trop court/);
  });

  it("accepte un secret de 32 caractères", () => {
    process.env[VAR] = "a".repeat(32);
    expect(getWebAuthnJwtSecret()).toEqual(new TextEncoder().encode("a".repeat(32)));
  });

  it("renvoie 503 générique sans fuite du détail si le secret manque", async () => {
    delete process.env[VAR];
    const r = chargerSecretWebAuthn();
    expect("reponse" in r).toBe(true);
    if (!("reponse" in r)) return;
    expect(r.reponse.status).toBe(503);
    const corps = JSON.stringify(await r.reponse.json());
    expect(corps).not.toContain(VAR);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining(VAR));
  });

  it("renvoie 503 si le secret est trop court", () => {
    process.env[VAR] = "c".repeat(31);
    const r = chargerSecretWebAuthn();
    expect("reponse" in r && r.reponse.status).toBe(503);
  });

  it("renvoie le secret quand il est valide", () => {
    process.env[VAR] = "b".repeat(40);
    const r = chargerSecretWebAuthn();
    expect("secret" in r).toBe(true);
  });
});
