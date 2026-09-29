-- Public profile text lives with the account; existing display_name and avatar_url remain canonical.
ALTER TABLE users ADD COLUMN bio TEXT CHECK (bio IS NULL OR length(bio) <= 500);
