ALTER TABLE posts ADD COLUMN stream_uid TEXT;
CREATE UNIQUE INDEX idx_posts_stream_uid ON posts(stream_uid) WHERE stream_uid IS NOT NULL;
