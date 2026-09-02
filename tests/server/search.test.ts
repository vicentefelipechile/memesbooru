import { describe, it, expect } from "vitest";
import { SearchQuerySchema } from "../../src/validators.js";

describe("searchQuerySchema", () => {
  it("valida sort y limit", () => {
    const r = SearchQuerySchema.parse({ tags: "pepe doge", sort: "popular", limit: 20 });
    expect(r.tags).toBe("pepe doge");
    expect(r.sort).toBe("popular");
  });
  it("tolera limit fuera de rango via catch", () => {
    const r = SearchQuerySchema.parse({ limit: 100 });
    expect(r.limit).toBe(20); // catch fallback per validators.ts
  });
});

describe("cursors", () => {
  it("encode/decode", async () => {
    const { encodeCursor, decodeCursor } = await import("../../src/repositories/post-repository.js");
    const c = encodeCursor({ score: 12.5, id: 42 });
    expect(decodeCursor(c)).toEqual({ score: 12.5, id: 42 });
  });
});
