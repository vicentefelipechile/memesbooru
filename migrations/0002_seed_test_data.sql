-- 0002_seed_test_data.sql — fixtures minimos para tests/dev (no escala real)
INSERT INTO users (id, username, display_name, rank, status, trust_score, created_at) VALUES
  (1, 'admin', 'Admin', 'trusted', 'active', 100, unixepoch()),
  (2, 'meme_lord', 'Meme Lord', 'normal', 'active', 10, unixepoch()),
  (3, 'nuevo_user', 'Nuevo', 'new', 'active', 0, unixepoch());

INSERT INTO tags (id, normalized_name, display_name, category, usage_count, status, created_at, updated_at) VALUES
  (1, 'pepe', 'Pepe', 'character', 120, 'active', unixepoch(), unixepoch()),
  (2, 'doge', 'Doge', 'character', 95, 'active', unixepoch(), unixepoch()),
  (3, 'gato_triste', 'Gato Triste', 'general', 80, 'active', unixepoch(), unixepoch()),
  (4, 'programacion', 'Programacion', 'general', 60, 'active', unixepoch(), unixepoch()),
  (5, 'reaccion', 'Reaccion', 'general', 150, 'active', unixepoch(), unixepoch());

INSERT INTO tag_aliases (id, alias_normalized, tag_id, created_by, created_at) VALUES
  (1, 'pepe_the_frog', 1, 1, unixepoch()),
  (2, 'perro_doge', 2, 1, unixepoch());
