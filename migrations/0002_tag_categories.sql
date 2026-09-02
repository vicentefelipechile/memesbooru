-- 0002_tag_categories.sql
-- Redefine tag categories for memes domain (Reaction/Source/People/Character/Meta).
-- Remaps old values: general→reaction, copyright/series→source, artist→meta.
-- Rebuilds table because CHECK constraint change requires it in SQLite.

PRAGMA foreign_keys = OFF;

BEGIN TRANSACTION;

-- Remap existing categories to new set (safe even if empty)
UPDATE tags
SET category = CASE
  WHEN category = 'general' THEN 'reaction'
  WHEN category IN ('copyright', 'series') THEN 'source'
  WHEN category = 'artist' THEN 'meta'
  ELSE category
END;

-- Rebuild table with new CHECK (category set for memes)
CREATE TABLE tags_new (
  id INTEGER PRIMARY KEY,
  normalized_name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  category TEXT NOT NULL CHECK (category IN ('reaction','source','people','character','meta')) DEFAULT 'reaction',
  usage_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active','deprecated','aliased')) DEFAULT 'active',
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

INSERT INTO tags_new (id, normalized_name, display_name, category, usage_count, status, created_by, created_at, updated_at)
SELECT id, normalized_name, display_name, category, usage_count, status, created_by, created_at, updated_at FROM tags;

DROP TABLE tags;
ALTER TABLE tags_new RENAME TO tags;

-- Recreate indexes (from 0001 + new category index)
CREATE INDEX idx_tags_normalized_prefix ON tags(normalized_name);
CREATE INDEX idx_tags_usage ON tags(usage_count DESC, normalized_name ASC);
CREATE INDEX idx_tags_category_usage ON tags(category, usage_count DESC, normalized_name ASC);

COMMIT;

PRAGMA foreign_keys = ON;
