-- 0001_initial.sql — Fase 2: Esquema base D1 Memesbooru
-- Fecha: 2026-09-02 | Objetivo: 1.5M posts / 37k tags / 15M post_tags
-- Principios: INTEGER PRIMARY KEY para joins, public_id opaco para URLs, sin SELECT *, sin JSON para filtros

-- Usuarios e identidad (PLAN 8)
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  rank TEXT NOT NULL CHECK (rank IN ('new','normal','trusted','restricted','banned')) DEFAULT 'new',
  status TEXT NOT NULL CHECK (status IN ('active','restricted','banned')) DEFAULT 'active',
  trust_score INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER,
  last_activity_at INTEGER
) STRICT;

CREATE TABLE google_identities (
  user_id INTEGER PRIMARY KEY,
  google_subject TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

-- Sesiones (cookies HttpOnly Secure SameSite)
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash BLOB NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  revoked_at INTEGER
) STRICT;
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- TOTP 2FA (PLAN 10)
CREATE TABLE user_totp (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  secret_encrypted BLOB NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  verified_at INTEGER
) STRICT;

CREATE TABLE totp_recovery_codes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash BLOB NOT NULL UNIQUE,
  used_at INTEGER,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_totp_recovery_user ON totp_recovery_codes(user_id);

-- Publicaciones
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  canonical_post_id INTEGER REFERENCES posts(id),
  media_type TEXT NOT NULL CHECK (media_type IN ('image','gif','video')),
  status TEXT NOT NULL CHECK (status IN ('uploading','processing','available','duplicate','rejected','hidden')) DEFAULT 'uploading',
  title TEXT,
  description TEXT,
  score REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  favorite_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  published_at INTEGER,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_posts_status_published ON posts(status, published_at DESC, id DESC);
CREATE INDEX idx_posts_status_score ON posts(status, score DESC, id DESC);
CREATE INDEX idx_posts_author ON posts(author_id, created_at DESC);
CREATE INDEX idx_posts_canonical ON posts(canonical_post_id) WHERE canonical_post_id IS NOT NULL;
CREATE INDEX idx_posts_media_status ON posts(media_type, status, published_at DESC, id DESC);

-- Proyeccion de lectura para grid/busqueda (PLAN 8)
CREATE TABLE post_listing (
  post_id INTEGER PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  public_id TEXT NOT NULL UNIQUE,
  media_type TEXT NOT NULL,
  status TEXT NOT NULL,
  low_variant_key TEXT NOT NULL,
  medium_variant_key TEXT,
  width INTEGER,
  height INTEGER,
  score REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  favorite_count INTEGER NOT NULL DEFAULT 0,
  comment_count INTEGER NOT NULL DEFAULT 0,
  published_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_post_listing_status_published ON post_listing(status, published_at DESC, post_id DESC);
CREATE INDEX idx_post_listing_status_score ON post_listing(status, score DESC, post_id DESC);

-- Assets multimedia
CREATE TABLE media_assets (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'r2',
  original_object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  duration_ms INTEGER,
  checksum BLOB NOT NULL,
  processing_status TEXT NOT NULL CHECK (processing_status IN ('pending','processing','done','failed')) DEFAULT 'pending',
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_media_assets_post ON media_assets(post_id);
CREATE INDEX idx_media_assets_checksum ON media_assets(checksum);

CREATE TABLE media_variants (
  id INTEGER PRIMARY KEY,
  media_asset_id INTEGER NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  variant_name TEXT NOT NULL CHECK (variant_name IN ('low','medium','original','thumbnail')),
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  quality_class TEXT NOT NULL CHECK (quality_class IN ('low','medium','original')),
  visibility TEXT NOT NULL CHECK (visibility IN ('public','quarantine')) DEFAULT 'public',
  created_at INTEGER NOT NULL,
  UNIQUE(media_asset_id, variant_name)
) STRICT;
CREATE INDEX idx_media_variants_asset ON media_variants(media_asset_id);

-- Tags
CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  normalized_name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  category TEXT NOT NULL CHECK (category IN ('general','artist','character','series','meta','copyright')) DEFAULT 'general',
  usage_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active','deprecated','aliased')) DEFAULT 'active',
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_tags_normalized_prefix ON tags(normalized_name);
CREATE INDEX idx_tags_usage ON tags(usage_count DESC, normalized_name ASC);

CREATE TABLE tag_aliases (
  id INTEGER PRIMARY KEY,
  alias_normalized TEXT NOT NULL UNIQUE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_tag_aliases_tag ON tag_aliases(tag_id);

CREATE TABLE tag_history (
  id INTEGER PRIMARY KEY,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL
) STRICT;

-- Relacion posts <-> tags (15M filas esperadas)
CREATE TABLE post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  added_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, tag_id)
) STRICT;
CREATE INDEX idx_post_tags_tag_post ON post_tags(tag_id, post_id);
CREATE INDEX idx_post_tags_post_tag ON post_tags(post_id, tag_id);

-- Votos numericos (rango -5 a 5, pendiente definir exacto — usando INTEGER con CHECK amplio)
CREATE TABLE post_ratings (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value INTEGER NOT NULL CHECK (value BETWEEN -5 AND 5 AND value != 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
) STRICT;
CREATE INDEX idx_post_ratings_user ON post_ratings(user_id);

-- Favoritos (independiente de votos)
CREATE TABLE post_favorites (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
) STRICT;
CREATE INDEX idx_post_favorites_user ON post_favorites(user_id, created_at DESC);
CREATE INDEX idx_post_favorites_post ON post_favorites(post_id);

-- Comentarios
CREATE TABLE comments (
  id INTEGER PRIMARY KEY,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  parent_id INTEGER REFERENCES comments(id) ON DELETE SET NULL,
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 2000),
  status TEXT NOT NULL CHECK (status IN ('visible','hidden','pending_review')) DEFAULT 'visible',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
) STRICT;
CREATE INDEX idx_comments_post_created ON comments(post_id, created_at ASC, id ASC);
CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_comments_parent ON comments(parent_id) WHERE parent_id IS NOT NULL;

-- Ranking
CREATE TABLE user_activity (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  approved_posts INTEGER NOT NULL DEFAULT 0,
  rejected_posts INTEGER NOT NULL DEFAULT 0,
  comments_count INTEGER NOT NULL DEFAULT 0,
  confirmed_reports INTEGER NOT NULL DEFAULT 0,
  last_upload_at INTEGER,
  last_comment_at INTEGER,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE user_rank_history (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  previous_rank TEXT,
  new_rank TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_rank_history_user ON user_rank_history(user_id, created_at DESC);

-- Moderacion
CREATE TABLE reports (
  id INTEGER PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id),
  target_type TEXT NOT NULL CHECK (target_type IN ('post','comment','user','tag')),
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','resolved','dismissed')) DEFAULT 'open',
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
) STRICT;
CREATE INDEX idx_reports_status ON reports(status, created_at DESC);
CREATE INDEX idx_reports_target ON reports(target_type, target_id);

CREATE TABLE moderation_actions (
  id INTEGER PRIMARY KEY,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  moderator_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_mod_actions_target ON moderation_actions(target_type, target_id);
CREATE INDEX idx_mod_actions_moderator ON moderation_actions(moderator_id, created_at DESC);

-- Queue jobs idempotentes
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY,
  job_type TEXT NOT NULL CHECK (job_type IN ('process_media','recalculate_post_score','update_tag_usage','aggregate_counters','cleanup_expired_sessions')),
  entity_id INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','processing','done','failed','dlq')) DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL,
  locked_at INTEGER,
  completed_at INTEGER,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_jobs_status_available ON jobs(status, available_at) WHERE status IN ('pending','processing');
CREATE INDEX idx_jobs_type ON jobs(job_type, status);
