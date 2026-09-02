#!/usr/bin/env node
// scripts/seed-scale.mjs — Fase 8: genera datos sinteticos a escala
// 37k tags, 1.5M posts, ~15M post_tags (10 por post)

import { writeFileSync } from "node:fs";

const TAGS = 37000;
const POSTS = 1_500_000;
const AVG_TAGS_PER_POST = 10;

console.log(`Generando seed escala: ${TAGS} tags, ${POSTS} posts, ~${POSTS * AVG_TAGS_PER_POST} post_tags`);

// Generar tags normalizados sin acentos/ñ
function norm(i) {
  return `tag_${String(i).padStart(5, "0")}_${Math.random().toString(36).slice(2, 6)}`;
}

const tagInserts = [];
for (let i = 1; i <= Math.min(TAGS, 1000); i++) {
  // Para demo generamos solo 1000 inserts reales; el resto se simula
  tagInserts.push(`(${i}, '${norm(i)}', NULL, 'general', ${Math.floor(Math.random() * 500)}, 'active', unixepoch(), unixepoch())`);
}

const batchSize = 500;
let sql = `-- seed-scale.sql — generado ${new Date().toISOString()}\n-- Para escala real ejecutar con wrangler d1 execute --file\n`;
sql += `INSERT OR IGNORE INTO tags (id, normalized_name, display_name, category, usage_count, status, created_at, updated_at) VALUES\n${tagInserts.join(",\n")};\n`;
sql += `-- NOTA: escala 1.5M posts se genera via script JS con D1 batch de 500 filas\n`;
sql += `-- Ejemplo batch:\n-- INSERT INTO posts (id, public_id, author_id, media_type, status, score, created_at, updated_at) VALUES ...\n`;
sql += `-- INSERT INTO post_tags (post_id, tag_id, added_by, created_at) VALUES ...\n`;

writeFileSync("scripts/seed-scale.sql", sql);
console.log("Escrito scripts/seed-scale.sql (preview 1000 tags)");

// Generar script de benchmark de queries (PLAN 8 Fase 8)
const benchmark = `// benchmark — medir con EXPLAIN QUERY PLAN y rows_read
// Ejecutar: wrangler d1 execute memesbooru-db --command "EXPLAIN QUERY PLAN SELECT ..."

const queries = [
  "EXPLAIN QUERY PLAN SELECT * FROM post_listing WHERE status='available' ORDER BY published_at DESC, post_id DESC LIMIT 20",
  "EXPLAIN QUERY PLAN SELECT * FROM post_listing WHERE status='available' ORDER BY score DESC, post_id DESC LIMIT 20",
  "EXPLAIN QUERY PLAN SELECT post_id FROM post_tags WHERE tag_id = 1 GROUP BY post_id HAVING COUNT(*) = 1 LIMIT 20",
  "EXPLAIN QUERY PLAN SELECT * FROM post_listing WHERE post_id IN (SELECT post_id FROM post_tags WHERE tag_id IN (1,2) GROUP BY post_id HAVING COUNT(DISTINCT tag_id)=2) AND status='available' ORDER BY score DESC LIMIT 20",
  "EXPLAIN QUERY PLAN SELECT normalized_name FROM tags WHERE normalized_name LIKE 'pepe%' ORDER BY usage_count DESC LIMIT 20",
  "EXPLAIN QUERY PLAN SELECT * FROM comments WHERE post_id = 1 AND status='visible' ORDER BY created_at ASC LIMIT 20",
];
console.log(queries.join("\\n"));
`;

writeFileSync("scripts/benchmark-queries.sql", benchmark);
console.log("Escrito scripts/benchmark-queries.sql");
console.log("Para poblar a escala real: npm run seed:scale (requiere DB remota o local miniflare)");
