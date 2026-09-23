-- Community entities for wiki, artists, pools, forum, revisions and mail.
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

CREATE TABLE mail_threads (
  id INTEGER PRIMARY KEY,
  subject TEXT NOT NULL,
  created_by INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE mail_thread_users (
  thread_id INTEGER NOT NULL REFERENCES mail_threads(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at INTEGER,
  PRIMARY KEY (thread_id, user_id)
) STRICT;

CREATE TABLE mail_messages (
  id INTEGER PRIMARY KEY,
  thread_id INTEGER NOT NULL REFERENCES mail_threads(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_mail_messages_thread ON mail_messages(thread_id, id DESC);

CREATE TABLE contact_tickets (
  id INTEGER PRIMARY KEY,
  requester_id INTEGER REFERENCES users(id),
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open','pending','closed')) DEFAULT 'open',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) STRICT;
CREATE INDEX idx_contact_tickets_status ON contact_tickets(status, updated_at DESC);
