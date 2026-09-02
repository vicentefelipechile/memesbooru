import { describe, it, expect } from "vitest";
import worker from "../../src/server/entrypoint";

async function req(path: string): Promise<Response> {
  return worker.fetch(new Request(`http://localhost${path}`), {} as never, {} as never);
}

describe("GET /api/health", () => {
  it("returns ok", async () => {
    const res = await req("/api/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok" });
  });
});

describe("GET /api/posts", () => {
  it("returns paginated payload", async () => {
    const res = await req("/api/posts");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[]; warning?: string };
    expect(Array.isArray(body.data)).toBe(true);
  });
});
