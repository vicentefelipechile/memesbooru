-- =========================================================================================================
-- MEMESBOORU — complete schema for the single D1 database
-- =========================================================================================================
-- A fresh database applies this file once. Previously applied migrations remain recorded by name.

-- Users and identity
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('active','restricted','banned')) DEFAULT 'active',
  bio TEXT CHECK (bio IS NULL OR length(bio) <= 500),
  email TEXT,
  password_hash BLOB,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER,
  last_activity_at INTEGER
) STRICT;
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;

CREATE TABLE google_identities (
  user_id INTEGER PRIMARY KEY,
  google_subject TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  last_login_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) STRICT;

-- Sessions
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

-- TOTP two-factor authentication
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

-- Posts
CREATE TABLE posts (
  id INTEGER PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  canonical_post_id INTEGER REFERENCES posts(id),
  stream_uid TEXT,
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
CREATE UNIQUE INDEX idx_posts_stream_uid ON posts(stream_uid) WHERE stream_uid IS NOT NULL;

-- Read projection for catalog and search
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

-- Media assets
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
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('reaction','source','people','character','meta')) DEFAULT 'reaction',
  usage_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active','deprecated','aliased')) DEFAULT 'active',
  created_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_tags_normalized_prefix ON tags(normalized_name);
CREATE INDEX idx_tags_usage ON tags(usage_count DESC, normalized_name ASC);
CREATE INDEX idx_tags_category_usage ON tags(category, usage_count DESC, normalized_name ASC);

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

-- Post-tag relationships
CREATE TABLE post_tags (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  added_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, tag_id)
) STRICT;
CREATE INDEX idx_post_tags_tag_post ON post_tags(tag_id, post_id);
CREATE INDEX idx_post_tags_post_tag ON post_tags(post_id, tag_id);

-- Numeric ratings
CREATE TABLE post_ratings (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  value INTEGER NOT NULL CHECK (value BETWEEN -5 AND 5 AND value != 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
) STRICT;
CREATE INDEX idx_post_ratings_user ON post_ratings(user_id);

-- Favorites, independent of ratings
CREATE TABLE post_favorites (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, user_id)
) STRICT;
CREATE INDEX idx_post_favorites_user ON post_favorites(user_id, created_at DESC);
CREATE INDEX idx_post_favorites_post ON post_favorites(post_id);

-- Comments
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

-- User activity counters
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

-- Moderation
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

-- Idempotent queue jobs
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

-- =========================================================================================================
-- COMMUNITY
-- =========================================================================================================

CREATE TABLE wiki_pages (
  id INTEGER PRIMARY KEY,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  current_revision_id INTEGER,
  status TEXT NOT NULL CHECK (status IN ('active','locked','hidden')) DEFAULT 'active',
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(tag_id)
) STRICT;
CREATE INDEX idx_wiki_pages_updated ON wiki_pages(updated_at DESC, id DESC);

CREATE TABLE wiki_revisions (
  id INTEGER PRIMARY KEY,
  wiki_page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  editor_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  reason TEXT
) STRICT;
CREATE INDEX idx_wiki_revisions_page ON wiki_revisions(wiki_page_id, id DESC);

CREATE TABLE artists (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  normalized_name TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('active','deleted')) DEFAULT 'active',
  updated_by INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_artists_name ON artists(normalized_name);

CREATE TABLE artist_aliases (
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  normalized_alias TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (artist_id, normalized_alias)
) STRICT;

CREATE TABLE post_artists (
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  artist_id INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  added_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, artist_id)
) STRICT;
CREATE INDEX idx_post_artists_artist ON post_artists(artist_id, post_id);

CREATE TABLE pools (
  id INTEGER PRIMARY KEY,
  public_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  creator_id INTEGER NOT NULL REFERENCES users(id),
  visibility TEXT NOT NULL CHECK (visibility IN ('public','private')) DEFAULT 'public',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_pools_visibility_updated ON pools(visibility, updated_at DESC, id DESC);

CREATE TABLE pool_posts (
  pool_id INTEGER NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  added_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (pool_id, post_id),
  UNIQUE(pool_id, position)
) STRICT;

CREATE TABLE forum_categories (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  position INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('visible','hidden')) DEFAULT 'visible'
) STRICT;
INSERT INTO forum_categories (id, name, description, position) VALUES
  (1, 'General', 'Conversación general.', 1),
  (2, 'Ayuda', 'Preguntas y soporte.', 2),
  (3, 'Anuncios', 'Noticias de Memesbooru.', 3);

CREATE TABLE forum_topics (
  id INTEGER PRIMARY KEY,
  category_id INTEGER NOT NULL REFERENCES forum_categories(id),
  author_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','locked','hidden')) DEFAULT 'open',
  is_pinned INTEGER NOT NULL DEFAULT 0,
  reply_count INTEGER NOT NULL DEFAULT 0,
  last_post_at INTEGER NOT NULL,
  last_author_id INTEGER REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_forum_topics_list ON forum_topics(category_id, is_pinned DESC, last_post_at DESC, id DESC);

CREATE TABLE forum_posts (
  id INTEGER PRIMARY KEY,
  topic_id INTEGER NOT NULL REFERENCES forum_topics(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  edited_at INTEGER
) STRICT;
CREATE INDEX idx_forum_posts_topic ON forum_posts(topic_id, id);

CREATE TABLE entity_revisions (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  editor_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('create','update','delete','revert')),
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_entity_revisions_entity ON entity_revisions(entity_type, entity_id, id DESC);

CREATE TABLE contact_tickets (
  id INTEGER PRIMARY KEY,
  requester_id INTEGER REFERENCES users(id),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','pending','closed')) DEFAULT 'open',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_contact_tickets_status ON contact_tickets(status, updated_at DESC);

-- =========================================================================================================
-- ROLES AND PERMISSIONS
-- =========================================================================================================

CREATE TABLE roles (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  position INTEGER NOT NULL DEFAULT 0,
  managed INTEGER NOT NULL DEFAULT 0 CHECK (managed IN (0, 1))
) STRICT;
CREATE TABLE role_permissions (
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (role_id, permission)
) STRICT;
CREATE TABLE user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
) STRICT;
CREATE INDEX idx_user_roles_role ON user_roles(role_id, user_id);

INSERT INTO roles (id, name, position, managed) VALUES (1, 'Administrator', 100, 1), (2, 'Moderator', 50, 0), (3, 'Contributor', 10, 0), (4, 'Member', 0, 1);
INSERT INTO role_permissions (role_id, permission) VALUES
  (1, 'manage_roles'), (1, 'moderate'), (1, 'edit_tags'), (1, 'manage_artists'), (1, 'manage_forum'), (1, 'upload_video'), (1, 'view_video'), (1, 'upload_without_cooldown'),
  (2, 'moderate'), (2, 'edit_tags'), (2, 'manage_artists'), (2, 'manage_forum'), (2, 'view_video'),
  (3, 'upload_without_cooldown'),
  (4, 'upload_post'), (4, 'comment'), (4, 'vote'), (4, 'favorite'), (4, 'report'),
  (4, 'create_pool'), (4, 'create_topic'), (4, 'edit_wiki'), (4, 'contact');

CREATE TRIGGER users_default_role AFTER INSERT ON users BEGIN
  INSERT INTO user_roles (user_id, role_id) VALUES (NEW.id, 4);
END;
