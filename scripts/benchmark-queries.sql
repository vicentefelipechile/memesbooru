// benchmark — medir con EXPLAIN QUERY PLAN y rows_read
// Ejecutar: wrangler d1 execute memesbooru-db --command "EXPLAIN QUERY PLAN SELECT ..."

const queries = [
  "EXPLAIN QUERY PLAN SELECT * FROM post_listing WHERE status='available' ORDER BY published_at DESC, post_id DESC LIMIT 20",
  "EXPLAIN QUERY PLAN SELECT * FROM post_listing WHERE status='available' ORDER BY score DESC, post_id DESC LIMIT 20",
  "EXPLAIN QUERY PLAN SELECT post_id FROM post_tags WHERE tag_id = 1 GROUP BY post_id HAVING COUNT(*) = 1 LIMIT 20",
  "EXPLAIN QUERY PLAN SELECT * FROM post_listing WHERE post_id IN (SELECT post_id FROM post_tags WHERE tag_id IN (1,2) GROUP BY post_id HAVING COUNT(DISTINCT tag_id)=2) AND status='available' ORDER BY score DESC LIMIT 20",
  "EXPLAIN QUERY PLAN SELECT normalized_name FROM tags WHERE normalized_name LIKE 'pepe%' ORDER BY usage_count DESC LIMIT 20",
  "EXPLAIN QUERY PLAN SELECT * FROM comments WHERE post_id = 1 AND status='visible' ORDER BY created_at ASC LIMIT 20",
];
console.log(queries.join("\n"));
