import { describe, it, expect } from "vitest";
import { searchQuerySchema } from "../../src/shared/validation/index.js";

describe("searchQuerySchema", () => {
  it("valida sort y limit", () => {
    const r = searchQuerySchema.parse({ tags: "pepe doge", sort: "popular", limit: 20 });
    expect(r.tags).toBe("pepe doge");
    expect(r.sort).toBe("popular");
  });
  it("rechaza limit fuera de rango", () => {
    expect(() => searchQuerySchema.parse({ limit: 100 })).toThrow();
  });
});

describe("cursors", () => {
  it("encode/decode", async () => {
    const { encodeCursor, decodeCursor } = await import("../../src/server/repositories/postRepository.js");
    const c = encodeCursor({ score: 12.5, id: 42 });
    expect(decodeCursor(c)).toEqual({ score: 12.5, id: 42 });
  });
});
