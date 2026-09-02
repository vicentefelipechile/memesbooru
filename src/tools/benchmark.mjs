#!/usr/bin/env node
// benchmark.mjs — Fase 8: mide latencias de endpoints clave

const BASE = process.env.BASE_URL || "http://localhost:5173";

async function time(label, fn) {
  const t0 = performance.now();
  const res = await fn();
  const dt = performance.now() - t0;
  console.log(`${label}: ${dt.toFixed(1)}ms status=${res.status}`);
  return dt;
}

async function run() {
  console.log(`Benchmark contra ${BASE}`);
  await time("GET /api/health", () => fetch(`${BASE}/api/health`));
  await time("GET /api/posts?sort=recent&limit=20", () => fetch(`${BASE}/api/posts?sort=recent&limit=20`));
  await time("GET /api/posts?sort=popular&limit=20", () => fetch(`${BASE}/api/posts?sort=popular&limit=20`));
  await time("GET /api/posts?tags=pepe&sort=recent", () => fetch(`${BASE}/api/posts?tags=pepe&sort=recent`));
  await time("GET /api/tags/autocomplete?q=pe", () => fetch(`${BASE}/api/tags/autocomplete?q=pe`));
  await time("GET /api/posts/xxxx (404)", () => fetch(`${BASE}/api/posts/000000`));
  console.log("Listo. Revisar rows_read con wrangler + PRAGMA optimize.");
}
run().catch(console.error);
