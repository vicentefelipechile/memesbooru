-- Account credentials and email ownership.
ALTER TABLE users ADD COLUMN email TEXT;
ALTER TABLE users ADD COLUMN email_verified_at INTEGER;
ALTER TABLE users ADD COLUMN password_hash BLOB;
CREATE UNIQUE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
