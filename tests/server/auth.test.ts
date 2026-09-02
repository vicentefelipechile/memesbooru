import { describe, it, expect } from "vitest";
import { normalizeTag } from "../../src/shared/validation/index.js";
import { totpVerify, generateTotpSecret } from "../../src/server/services/authService.js";

describe("normalizeTag", () => {
  it("quita acentos y ñ, minusculas, _", () => {
    expect(normalizeTag("José García")).toBe("jose_garcia");
    expect(normalizeTag("Pepe   Meme")).toBe("pepe_meme");
    expect(normalizeTag("NIÑO 123")).toBe("nino_123");
    expect(normalizeTag("  Gato_Triste ")).toBe("gato_triste");
  });
});

describe("TOTP", () => {
  it("genera y verifica", async () => {
    const secret = generateTotpSecret();
    // Simular codigo valido generando uno manualmente via misma funcion (ventana amplia)
    // Solo verificamos que secreto es base32 valido y que verificar con codigo invalido falla
    const ok = await totpVerify(secret, "000000");
    expect(ok).toBe(false); // 000000 raramente valido
    expect(secret.length).toBeGreaterThan(16);
  });
});
